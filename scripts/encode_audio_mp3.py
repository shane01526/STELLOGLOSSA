"""Batch encode output/audio/*.wav → *.mp3 + update audio_manifest.json.

Why: wav files are 361 MB (too big for git, too big for Render slug). MP3 mono
96 kbps shrinks the 12,000-word set to ~100 MB with no audible loss on our
synthesized voice.

Usage:
    python scripts/encode_audio_mp3.py              # encode + update manifest
    python scripts/encode_audio_mp3.py --dry-run    # preview only
    python scripts/encode_audio_mp3.py --bitrate 128k

ffmpeg is auto-located from PATH or ~/tools/ffmpeg/bin/ffmpeg.exe (our dev
install from the audio_renderer step).

After encoding, this script also regenerates bundle.json so the frontend's
audio_manifest reflects the new .mp3 paths.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.resolve()
STELLO = ROOT / "stelloglossa"
AUDIO_DIR = STELLO / "output" / "audio"
MANIFEST = STELLO / "output" / "audio_manifest.json"


def find_ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    candidate = Path.home() / "tools" / "ffmpeg" / "bin" / "ffmpeg.exe"
    if candidate.is_file():
        return str(candidate)
    sys.exit("ERROR: ffmpeg not found on PATH or at ~/tools/ffmpeg/bin/ffmpeg.exe")


def encode_all(ffmpeg: str, bitrate: str, sample_rate: str, dry_run: bool) -> tuple[int, int, int]:
    wavs = sorted(AUDIO_DIR.rglob("*.wav"))
    print(f"Found {len(wavs)} .wav files")
    encoded = skipped = failed = 0
    for i, wav in enumerate(wavs):
        mp3 = wav.with_suffix(".mp3")
        if mp3.exists() and mp3.stat().st_size > 100:
            skipped += 1
            continue
        if dry_run:
            continue
        try:
            subprocess.run(
                [
                    ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                    "-i", str(wav),
                    "-ac", "1", "-ar", sample_rate, "-b:a", bitrate,
                    str(mp3),
                ],
                check=True, capture_output=True, timeout=10,
            )
            encoded += 1
        except subprocess.CalledProcessError as exc:
            failed += 1
            if failed <= 3:
                print(f"  fail: {wav.name}: {exc.stderr.decode('utf-8', 'replace')[:200]}")
        except subprocess.TimeoutExpired:
            failed += 1
        if (i + 1) % 1000 == 0:
            print(f"  {i + 1}/{len(wavs)} processed (enc={encoded} skip={skipped} fail={failed})")
    return encoded, skipped, failed


def update_manifest(dry_run: bool) -> int:
    if not MANIFEST.exists():
        print(f"WARN: manifest {MANIFEST} not found; skipping manifest update.")
        return 0
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    changed = 0
    for entry in data:
        p = entry.get("path", "")
        if p.endswith(".wav"):
            entry["path"] = p[:-4] + ".mp3"
            changed += 1
    if not dry_run and changed:
        MANIFEST.write_text(
            json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
        )
    print(f"Manifest: {changed}/{len(data)} entries updated to .mp3")
    return changed


def rebuild_bundle() -> None:
    """Re-run bundle stage so public/data/bundle.json picks up the new manifest."""
    print("Rebuilding bundle.json …")
    env = {"PYTHONIOENCODING": "utf-8", **__import__("os").environ}
    r = subprocess.run(
        [sys.executable, "pipeline.py", "--stage", "bundle"],
        cwd=str(STELLO), env=env, capture_output=True, text=True,
    )
    if r.returncode != 0:
        print("  bundle rebuild failed:")
        print(r.stderr[-600:])
    else:
        # Show the last informative line
        line = [ln for ln in r.stderr.splitlines() if "bundle:" in ln] or [r.stderr[-200:]]
        print(f"  {line[-1].strip()}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--bitrate", default="96k", help="MP3 bitrate (default: 96k)")
    p.add_argument("--sample-rate", default="22050", help="sample rate (default: 22050)")
    p.add_argument("--dry-run", action="store_true", help="show what would happen")
    p.add_argument("--skip-bundle", action="store_true", help="don't rebuild bundle.json")
    args = p.parse_args()

    ffmpeg = find_ffmpeg()
    print(f"ffmpeg: {ffmpeg}")
    print(f"bitrate: {args.bitrate}  sample-rate: {args.sample_rate}")

    enc, skip, fail = encode_all(ffmpeg, args.bitrate, args.sample_rate, args.dry_run)
    print(f"\nENCODING: encoded={enc} skipped={skip} failed={fail}")
    update_manifest(args.dry_run)
    if not args.dry_run and not args.skip_bundle and enc > 0:
        rebuild_bundle()
    print("done.")


if __name__ == "__main__":
    main()
