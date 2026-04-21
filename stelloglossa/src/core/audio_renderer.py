"""MBROLA-based per-word audio synthesis with physics-driven prosody.

Pipeline per word:
    IPA → SAMPA (via sampa_mapper) →
    build .pho with per-syllable pitch contour →
    mbrola.exe writes raw .wav →
    ffmpeg applies reverb + EQ →
    final .wav

Per-star parameters (from pulsar physics):
    period_s      → base pitch + speech speed
    tone_count    → pitch-variation amplitude
    w50_ms        → vowel duration
    period_dot    → subtle amplitude decay (star "age")
    dm            → reverb decay (signal thickness through interstellar medium)
    distance_kpc  → reverb delay (spatial distance)
    jname hash    → MBROLA voice selection (us1/us2/us3/en1/de6/fr4)

All tools missing? Pipeline still completes and writes a manifest; frontend
just falls back to its Web Audio formant synth (public/speech.js).
"""
from __future__ import annotations

import json
import logging
import math
import shutil
import subprocess
import tempfile
from pathlib import Path

from config import (
    AUDIO_CONFIG,
    DATA_PROCESSED,
    FFMPEG_EXE,
    LEXICON_DIR,
    MBROLA_EXE,
    MBROLA_VOICES_DIR,
    OUTPUT_DIR,
    PHONOLOGY_DIR,
)
from src.core.sampa_mapper import VOICE_DESCRIPTORS, pick_voice, to_sampa

log = logging.getLogger(__name__)

AUDIO_DIR = OUTPUT_DIR / "audio"
MANIFEST_PATH = OUTPUT_DIR / "audio_manifest.json"

_CONS_CLASS = {
    "p": "stop", "b": "stop", "t": "stop", "d": "stop", "k": "stop", "g": "stop",
    "m": "nasal", "n": "nasal", "N": "nasal",
    "s": "fric", "z": "fric", "S": "fric", "f": "fric", "v": "fric", "h": "fric",
    "l": "liquid", "r": "liquid", "R": "liquid", "4": "liquid",
    "j": "other", "w": "other",
}
_VOWEL_CHARS = set("aeiouEOy29")  # SAMPA vowels we use (plus 2=ø, 9=œ, etc.)


def _is_vowel(sampa: str) -> bool:
    """True if SAMPA token represents a vowel (handles `a:`, `a~`, `2:` etc)."""
    if not sampa:
        return False
    # Strip length and nasal markers
    core = sampa.rstrip(":").rstrip("~")
    return core in _VOWEL_CHARS or (len(core) == 1 and core in _VOWEL_CHARS)


# ══════════════════ Physics → speech parameters ══════════════════


def _lerp(a: float, b: float, t: float) -> float:
    t = max(0.0, min(1.0, t))
    return a + (b - a) * t


def _log_remap(value: float, lo: float, hi: float, out_lo: float, out_hi: float) -> float:
    """Log-scale interpolation: value in [lo, hi] → [out_lo, out_hi]."""
    v = max(lo, min(hi, value))
    log_v = math.log10(max(v, 1e-12))
    log_lo = math.log10(max(lo, 1e-12))
    log_hi = math.log10(max(hi, 1e-12))
    t = (log_v - log_lo) / max(log_hi - log_lo, 1e-9)
    return _lerp(out_lo, out_hi, t)


def speech_params_for(pulsar: dict, profile: dict) -> dict:
    """Map a pulsar's physics to speech parameters."""
    p = float(pulsar["period_s"])
    w50 = float(pulsar["w50_ms"])
    tones = int(profile.get("tone_count") or 0)

    # Short period → fast + high-pitched
    base_pitch_hz = _log_remap(p, 0.001, 5.0,
                                AUDIO_CONFIG["pitch_hz"]["high"],
                                AUDIO_CONFIG["pitch_hz"]["low"])
    # Vowel duration from pulse width
    vowel_ms = int(_log_remap(w50, 0.1, 100.0,
                               AUDIO_CONFIG["vowel_dur_ms"]["short"],
                               AUDIO_CONFIG["vowel_dur_ms"]["long"]))
    # Tone count widens pitch swing per syllable
    pitch_spread = tones * AUDIO_CONFIG["tone_pitch_spread_hz"]

    return {
        "base_pitch_hz": base_pitch_hz,
        "vowel_ms": vowel_ms,
        "pitch_spread_hz": pitch_spread,
        "sag_hz": AUDIO_CONFIG["pitch_sag_hz"],
    }


def reverb_params_for(pulsar: dict) -> dict:
    dm = float(pulsar.get("dm") or 0.0)
    dist = float(pulsar.get("distance_kpc") or 0.0)
    decay = _lerp(AUDIO_CONFIG["reverb_decay"]["min"],
                  AUDIO_CONFIG["reverb_decay"]["max"],
                  min(dm / 500.0, 1.0))
    delay_ms = _lerp(AUDIO_CONFIG["reverb_delay_ms"]["min"],
                     AUDIO_CONFIG["reverb_delay_ms"]["max"],
                     min(dist / 15.0, 1.0))
    return {"decay": round(decay, 3), "delay_ms": int(delay_ms)}


# ══════════════════ .pho file generation ══════════════════


def _classify(sampa: str) -> str:
    if _is_vowel(sampa):
        return "vowel"
    return _CONS_CLASS.get(sampa, "other")


def build_pho(sampas: list[str], params: dict, tone_idx: int = 0) -> str:
    """Render a SAMPA phoneme sequence into a MBROLA .pho source.

    Adds per-syllable pitch contour: falling-rising if tone_idx=0, rising if 1,
    falling if 2, etc. Approximates basic tonal behaviour for stars with
    tone systems without implementing the full tone letters system.
    """
    lines: list[str] = ["_ 80"]
    base = params["base_pitch_hz"]
    sag = params["sag_hz"]
    vowel_ms = params["vowel_ms"]
    # Cap pitch swing so the contour never goes outside [50, 400] Hz — MBROLA
    # explodes on negative or extreme pitch values, especially for low-base-pitch
    # voices like our long-period (low-pitch) stars.
    max_swing = max(5.0, min(params["pitch_spread_hz"], base * 0.45, 80.0))
    sp = max_swing

    # Pre-compute a tone contour (0, 50%, 100% pitch points relative to base)
    def _clip(hz: float) -> int:
        return int(max(55, min(380, hz)))

    contour = {
        0: [(0, base), (50, base - sag), (100, base - sag)],          # flat-falling
        1: [(0, base - sp), (50, base), (100, base + sp)],            # rising
        2: [(0, base + sp), (50, base), (100, base - sp)],            # falling
        3: [(0, base - sp / 2), (50, base + sp / 2), (100, base - sp / 2)],  # dip
        4: [(0, base), (50, base - sp), (100, base)],                 # valley
        5: [(0, base + sp), (50, base + sp), (100, base)],            # high-fall
    }.get(tone_idx % 6, [(0, base), (100, base - sag)])
    contour = [(pct, _clip(hz)) for pct, hz in contour]

    cons_dur = AUDIO_CONFIG["cons_dur_ms"]

    # MBROLA needs a pitch anchor on the first phoneme of the utterance, otherwise
    # long consonant clusters (CCC before the first vowel) will cause "Concat PANIC"
    # errors because there's no pitch info to interpolate from.
    first_pitched = False
    for s in sampas:
        kind = _classify(s)
        if kind == "vowel":
            pitch_str = " ".join(f"{int(pct)} {int(hz)}" for pct, hz in contour)
            lines.append(f"{s} {vowel_ms} {pitch_str}")
            first_pitched = True
        else:
            dur = cons_dur.get(kind, cons_dur["other"])
            if not first_pitched:
                # Anchor pitch on the first consonant of the word
                lines.append(f"{s} {dur} 0 {int(base)}")
                first_pitched = True
            else:
                lines.append(f"{s} {dur}")
    lines.append("_ 120")
    return "\n".join(lines) + "\n"


# ══════════════════ Tool discovery ══════════════════


def find_mbrola() -> Path | None:
    if Path(MBROLA_EXE).is_file():
        return Path(MBROLA_EXE)
    exe = shutil.which("mbrola")
    return Path(exe) if exe else None


def find_ffmpeg() -> Path | None:
    if Path(FFMPEG_EXE).is_file():
        return Path(FFMPEG_EXE)
    exe = shutil.which("ffmpeg")
    return Path(exe) if exe else None


def find_voice(voice: str) -> Path | None:
    """Resolve the MBROLA voice data file — must exist and be readable."""
    p = Path(MBROLA_VOICES_DIR) / voice / voice
    return p if p.is_file() else None


# ══════════════════ Core synthesis ══════════════════


def _run_mbrola(mbrola: Path, voice_file: Path, pho_text: str, out_wav: Path) -> bool:
    """Write .pho to temp, call mbrola, return True on success."""
    with tempfile.NamedTemporaryFile("w", suffix=".pho", delete=False, encoding="utf-8") as f:
        f.write(pho_text)
        pho_path = Path(f.name)
    try:
        # -e = ignore fatal errors on unknown diphone (emit silence instead of crashing)
        result = subprocess.run(
            [str(mbrola), "-e", str(voice_file), str(pho_path), str(out_wav)],
            capture_output=True, timeout=15,
        )
        if result.returncode != 0 or not out_wav.is_file() or out_wav.stat().st_size < 200:
            return False
        return True
    except (subprocess.TimeoutExpired, OSError):
        return False
    finally:
        try:
            pho_path.unlink()
        except OSError:
            pass


def _run_ffmpeg(ffmpeg: Path, src_wav: Path, dst_wav: Path, reverb: dict) -> bool:
    """Apply reverb + highpass/lowpass. On failure, copies src → dst."""
    filters = (
        f"aecho={AUDIO_CONFIG['reverb_in_gain']}:{reverb['decay']}:"
        f"{reverb['delay_ms']}:0.4,"
        f"highpass=f={AUDIO_CONFIG['highpass_hz']},"
        f"lowpass=f={AUDIO_CONFIG['lowpass_hz']}"
    )
    try:
        r = subprocess.run(
            [str(ffmpeg), "-y", "-i", str(src_wav), "-af", filters,
             "-ar", "22050", "-ac", "1", str(dst_wav)],
            capture_output=True, timeout=15,
        )
        if r.returncode == 0 and dst_wav.is_file() and dst_wav.stat().st_size > 200:
            return True
        log.debug("ffmpeg stderr: %s", r.stderr.decode("utf-8", "replace")[:200])
    except (subprocess.TimeoutExpired, OSError) as exc:
        log.warning("ffmpeg failed: %s", exc)
    # Fallback: just copy the dry signal
    shutil.copyfile(src_wav, dst_wav)
    return False


def render_word(
    ipa: str, voice: str, params: dict, reverb: dict,
    out_wav: Path, mbrola: Path, ffmpeg: Path | None, tone_idx: int = 0,
) -> tuple[bool, str]:
    """Synthesize one word. Returns (success, notes_or_error)."""
    voice_file = find_voice(voice)
    if not voice_file:
        return False, f"voice_data_missing:{voice}"

    sampas = to_sampa(ipa, voice)
    if not sampas:
        # Try fallback voice de6 (most permissive)
        alt = to_sampa(ipa, "de6")
        if alt:
            sampas, voice, voice_file = alt, "de6", find_voice("de6")
            if voice_file is None:
                return False, "fallback_voice_missing"
        else:
            return False, "unmappable_phonemes"

    pho = build_pho(sampas, params, tone_idx)

    if ffmpeg:
        # Render to temp raw, then ffmpeg-process to final path
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            raw_path = Path(f.name)
        ok = _run_mbrola(mbrola, voice_file, pho, raw_path)
        if not ok:
            try: raw_path.unlink()
            except OSError: pass
            return False, "mbrola_failed"
        _run_ffmpeg(ffmpeg, raw_path, out_wav, reverb)
        try: raw_path.unlink()
        except OSError: pass
    else:
        # No ffmpeg — dry output straight from mbrola
        ok = _run_mbrola(mbrola, voice_file, pho, out_wav)
        if not ok:
            return False, "mbrola_failed"
    return True, voice


# ══════════════════ Pipeline entry ══════════════════


def _load_pulsars() -> dict[str, dict]:
    return {
        p["jname"]: p
        for p in json.loads((DATA_PROCESSED / "pulsars.json").read_text(encoding="utf-8"))
    }


def _load_profile(jname: str) -> dict | None:
    path = PHONOLOGY_DIR / f"{jname}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None


def run() -> Path:
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    mbrola = find_mbrola()
    ffmpeg = find_ffmpeg()
    if not mbrola:
        log.warning("mbrola.exe not found at %s — skipping audio, writing manifest only.", MBROLA_EXE)
    else:
        log.info("mbrola: %s", mbrola)
    if not ffmpeg:
        log.warning("ffmpeg not found at %s — reverb disabled, outputs will be dry.", FFMPEG_EXE)
    else:
        log.info("ffmpeg: %s", ffmpeg)

    pulsars = _load_pulsars()
    manifest: list[dict] = []
    stats = {"rendered": 0, "skipped_unmappable": 0, "mbrola_failed": 0, "no_mbrola": 0}
    voice_stats: dict[str, int] = {}

    for path in sorted(LEXICON_DIR.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        jname = payload["jname"]
        pulsar = pulsars.get(jname)
        profile = _load_profile(jname)
        if not pulsar or not profile:
            continue

        words_flat = [
            e.get("form", "")
            for entries in payload.get("lexicon", {}).values()
            for e in entries
        ]
        voice = pick_voice(jname, profile["vowel_inventory"], words_flat)
        params = speech_params_for(pulsar, profile)
        reverb = reverb_params_for(pulsar)
        voice_stats[voice] = voice_stats.get(voice, 0) + 1

        star_dir = AUDIO_DIR / jname
        if mbrola:
            star_dir.mkdir(parents=True, exist_ok=True)
            # Record which voice+params were used, for debugging.
            (star_dir / "voice.txt").write_text(
                f"voice={voice}  ({VOICE_DESCRIPTORS.get(voice, '?')})\n"
                f"base_pitch_hz={params['base_pitch_hz']:.1f}\n"
                f"vowel_ms={params['vowel_ms']}\n"
                f"pitch_spread_hz={params['pitch_spread_hz']}\n"
                f"reverb_decay={reverb['decay']}  reverb_delay_ms={reverb['delay_ms']}\n",
                encoding="utf-8",
            )

        for field, entries in payload.get("lexicon", {}).items():
            for idx, entry in enumerate(entries):
                form = entry.get("form", "")
                rel = f"{jname}/{field}_{idx}.wav"
                out_path = AUDIO_DIR / f"{jname}/{field}_{idx}.wav"
                record = {
                    "jname": jname, "field": field, "idx": idx,
                    "form": form, "gloss": entry.get("gloss", ""),
                    "voice": voice, "path": rel, "rendered": False,
                }
                if not mbrola or not form:
                    stats["no_mbrola"] += int(not mbrola)
                    manifest.append(record)
                    continue
                # tone_idx = per-entry contour variation for musicality
                tone_idx = idx % 6
                ok, note = render_word(form, voice, params, reverb,
                                        out_path, mbrola, ffmpeg, tone_idx)
                record["rendered"] = ok
                record["note"] = note
                if ok:
                    stats["rendered"] += 1
                elif note == "unmappable_phonemes":
                    stats["skipped_unmappable"] += 1
                else:
                    stats["mbrola_failed"] += 1
                manifest.append(record)

        log.info("[%s] voice=%s  words=%d  rendered so far=%d",
                 jname, voice, len(words_flat), stats["rendered"])

    MANIFEST_PATH.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    log.info("done: %d words, rendered %d  (unmappable=%d  mbrola_failed=%d)",
             len(manifest), stats["rendered"],
             stats["skipped_unmappable"], stats["mbrola_failed"])
    log.info("voice distribution: %s", voice_stats)
    return MANIFEST_PATH


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
    run()
