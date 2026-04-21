"""IPA → SAMPA per-MBROLA-voice mapping.

MBROLA voices have recorded (phoneme1, phoneme2) diphone pairs. Each voice
uses its own SAMPA dialect; we keep per-voice tables because e.g. German
SAMPA encodes /a/ as `a:` (long) while French SAMPA uses plain `a`.

After empirical testing against the actual voice .dpn inventories, only
fr4 and de6 give 100% coverage for our lexicon's phoneme set. They're
distinct enough (French female vs German male) to give each star a clear
individual voice when combined with the physics-driven pitch/speed variation.

Our lexicon inventory (from phonology_engine.py):
  vowels:     a e i o u ɛ ɔ y ø ã
  consonants: p b t d k g m n ŋ s z ʃ f v h l r ɾ j w

pick_voice() returns either "fr4" or "de6" deterministically from jname hash,
with a safety override: stars whose lexicon needs /h/ must use de6 (fr4
doesn't have /h/ diphones); stars with /ã/ must use fr4.
"""
from __future__ import annotations

import hashlib

# fr4 (French Female): pure vowels a e i o u, nasal a~, French R.
_FR4: dict[str, str | None] = {
    "a": "a", "e": "e", "i": "i", "o": "o", "u": "u",
    "ɛ": "E", "ɔ": "O", "y": "y", "ø": "2", "ã": "a~",
    "p": "p", "b": "b", "t": "t", "d": "d", "k": "k", "g": "g",
    "m": "m", "n": "n", "ŋ": "N",
    "s": "s", "z": "z", "ʃ": "S", "f": "f", "v": "v",
    # French has no /h/ diphones, but French speakers routinely drop /h/
    # ("h muet") in loanwords. We drop it — this keeps stars that have both
    # /h/ AND /ã/ (fr4-only nasals) renderable.
    "h": "",
    "l": "l", "r": "R", "ɾ": "R",
    "j": "j", "w": "w",
}

# de6 (German Male): uses German SAMPA with long vowels `a: e: i: o: u:`
# for pure vowel sounds. Short vowels E, O used for /ɛ/, /ɔ/. Has /h/.
_DE6: dict[str, str | None] = {
    "a": "a:", "e": "e:", "i": "i:", "o": "o:", "u": "u:",
    "ɛ": "E", "ɔ": "O", "y": "y:", "ø": "2:",
    "ã": None,                       # German has no nasal vowels
    "p": "p", "b": "b", "t": "t", "d": "d", "k": "k", "g": "g",
    "m": "m", "n": "n", "ŋ": "N",
    "s": "s", "z": "z", "ʃ": "S", "f": "f", "v": "v", "h": "h",
    "l": "l", "r": "R", "ɾ": "R",
    "j": "j", "w": "v",              # de6 uses v for /w/
}

VOICE_MAPS: dict[str, dict[str, str | None]] = {"fr4": _FR4, "de6": _DE6}

# Voice pool for deterministic hash-based selection.
VOICE_POOL = ["fr4", "de6"]

VOICE_DESCRIPTORS = {
    "fr4": "法式女聲 · 柔和、有鼻音共鳴",
    "de6": "德式男聲 · 低沉、母音清晰",
}


def pick_voice(jname: str, vowel_inventory: list[str], lexicon_words: list[str] | None = None) -> str:
    """Deterministic per-star voice selection.

    Hard rules:
      - /ã/ in inventory → must use fr4 (de6 can't render nasals).
      - /h/ actually present in lexicon → must use de6 (fr4 has no /h/ diphone).
    Soft rule:
      - Otherwise pick from VOICE_POOL by jname hash for variety.
    """
    vowels = set(vowel_inventory)
    if "ã" in vowels:
        return "fr4"

    has_h = False
    if lexicon_words:
        for w in lexicon_words:
            if "h" in w:
                has_h = True
                break
    if has_h:
        return "de6"

    h = int(hashlib.sha256(jname.encode("utf-8")).hexdigest()[:8], 16)
    return VOICE_POOL[h % len(VOICE_POOL)]


def to_sampa(ipa_word: str, voice: str) -> list[str] | None:
    """Segment an IPA word into SAMPA phonemes for the target voice.

    Returns None if any phoneme can't be mapped (caller should fall back).
    Skips prosodic marks (stress, length, syllable break).
    """
    mapping = VOICE_MAPS[voice]
    out: list[str] = []
    for ch in ipa_word:
        if ch.isspace() or ch in ("ˈ", "ˌ", ".", "-", ":", "ː"):
            continue
        if ch not in mapping:
            return None
        sampa = mapping[ch]
        if sampa is None:
            return None
        if sampa == "":
            continue   # voice-specific elision (e.g. French "h muet")
        out.append(sampa)
    return out or None
