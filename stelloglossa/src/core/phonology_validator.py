"""驗證 lexicon_generator 回傳的詞是否符合音系矩陣。"""
from __future__ import annotations

import re
from typing import Any

# Fallback universal consonant class — only used when profile lacks its own
# consonant_inventory (backward compatibility with older profiles).
CONSONANT_CLASS = "[pbtdkgmnŋszʃʒfvɾlɹrh]"


def _char_class(chars: list[str]) -> str:
    return "[" + "".join(re.escape(c) for c in chars) + "]"


def _syllable_regex(structure: str, vowels: list[str], consonants: list[str] | None = None) -> re.Pattern[str]:
    vowel_class = _char_class(vowels)
    consonant_class = _char_class(consonants) if consonants else CONSONANT_CLASS
    pattern = structure.replace("C", consonant_class).replace("V", vowel_class)
    return re.compile(f"^({pattern})+$", re.UNICODE)


def validate_word(word: str, syllable_structure: str, vowels: list[str],
                  consonants: list[str] | None = None) -> bool:
    """True if `word` can be segmented into repetitions of the syllable template,
    using only the provided consonant + vowel inventories."""
    cleaned = re.sub(r"[\u0300-\u036f˦˥˧˨˩ˈˌ\.ː\-]", "", word)
    regex = _syllable_regex(syllable_structure, vowels, consonants)
    return bool(regex.match(cleaned))


def validate_entry(entry: dict[str, Any], profile: dict[str, Any]) -> tuple[bool, str]:
    word = str(entry.get("form") or entry.get("ipa") or entry.get("word") or "").strip()
    if not word:
        return False, "missing form"
    ok = validate_word(
        word,
        profile["syllable_structure"],
        profile["vowel_inventory"],
        profile.get("consonant_inventory"),
    )
    return ok, "" if ok else f"syllable mismatch: {word}"


def filter_valid(
    lexicon: dict[str, list[dict[str, Any]]], profile: dict[str, Any]
) -> dict[str, list[dict[str, Any]]]:
    """Return a new lexicon keeping only entries that pass validation."""
    kept: dict[str, list[dict[str, Any]]] = {}
    for field, entries in lexicon.items():
        kept[field] = [e for e in entries if validate_entry(e, profile)[0]]
    return kept
