"""Module 2: 將 4 個物理參數映射為語言音系特徵。"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from config import (
    CONSONANT_COUNT_BY_SYLLABLE,
    CONSONANT_POOL_BY_TONE,
    DM_THRESHOLDS,
    PDOT_THRESHOLDS,
    PHONOLOGY_DIR,
    SYLLABLE_STRUCTURES,
    SYLLABLE_THRESHOLDS_S,
    TENSE_RICHNESS,
    TONE_COUNTS,
    VOWEL_INVENTORIES,
    W50_THRESHOLDS_MS,
)
from src.core.grammar import build_grammar

log = logging.getLogger(__name__)


def _bin_index(value: float, thresholds: list[float]) -> int:
    """Return 0..len(thresholds) — how many thresholds the value exceeds."""
    idx = 0
    for t in thresholds:
        if value < t:
            return idx
        idx += 1
    return idx


def syllable_from_period(period_s: float) -> str:
    return SYLLABLE_STRUCTURES[_bin_index(period_s, SYLLABLE_THRESHOLDS_S)]


def tones_from_dm(dm: float) -> int:
    return TONE_COUNTS[_bin_index(dm, DM_THRESHOLDS)]


def tense_from_pdot(period_dot: float) -> str:
    return TENSE_RICHNESS[_bin_index(period_dot, PDOT_THRESHOLDS)]


def vowels_from_w50(w50_ms: float) -> list[str]:
    return VOWEL_INVENTORIES[_bin_index(w50_ms, W50_THRESHOLDS_MS)]


def consonants_from_syllable_and_tone(syllable: str, tones: int) -> list[str]:
    """Consonant inventory has two axes:
      - size  ← syllable structure  (more C slots → more contrasts needed)
      - flavour ← tone count        (atonal → fricative-rich; tonal → plosive-rich)
    """
    size = CONSONANT_COUNT_BY_SYLLABLE.get(syllable, 8)
    # Snap to the nearest defined pool key (0/2/4/6)
    pool_key = min(CONSONANT_POOL_BY_TONE.keys(), key=lambda k: abs(k - tones))
    pool = CONSONANT_POOL_BY_TONE[pool_key]
    return pool[:size]


def build_profile(pulsar: dict[str, Any]) -> dict[str, Any]:
    syllable = syllable_from_period(pulsar["period_s"])
    tones = tones_from_dm(pulsar["dm"])
    tense = tense_from_pdot(pulsar["period_dot"])
    vowels = vowels_from_w50(pulsar["w50_ms"])
    consonants = consonants_from_syllable_and_tone(syllable, tones)
    complexity_score = len(syllable) * max(tones, 1) * len(vowels)
    grammar = build_grammar(pulsar["jname"])
    return {
        "jname": pulsar["jname"],
        "constellation": pulsar.get("constellation", "Unknown"),
        "syllable_structure": syllable,
        "tone_count": tones,
        "tense_richness": tense,
        "vowel_inventory": vowels,
        "consonant_inventory": consonants,
        "complexity_score": complexity_score,
        "grammar": grammar,
        "source_params": {
            "period_s": pulsar["period_s"],
            "dm": pulsar["dm"],
            "period_dot": pulsar["period_dot"],
            "w50_ms": pulsar["w50_ms"],
        },
    }


def run(pulsars: list[dict[str, Any]] | None = None, output_dir: Path | None = None) -> list[dict[str, Any]]:
    if pulsars is None:
        from config import DATA_PROCESSED
        pulsars = json.loads((DATA_PROCESSED / "pulsars.json").read_text(encoding="utf-8"))
    target_dir = output_dir or PHONOLOGY_DIR
    target_dir.mkdir(parents=True, exist_ok=True)

    # Drop stale profiles from previous runs (e.g. if sample changed)
    keep = {p["jname"] for p in pulsars}
    removed = 0
    for old in target_dir.glob("*.json"):
        if old.stem not in keep:
            old.unlink()
            removed += 1
    if removed:
        log.info("removed %d stale phonology profiles", removed)

    profiles = []
    for p in pulsars:
        profile = build_profile(p)
        (target_dir / f"{p['jname']}.json").write_text(
            json.dumps(profile, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        profiles.append(profile)
    log.info("Wrote %d phonology profiles to %s", len(profiles), target_dir)
    return profiles


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
