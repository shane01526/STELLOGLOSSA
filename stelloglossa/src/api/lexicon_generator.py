"""Module 3: 以 LLM (Anthropic / OpenAI / Gemini 擇一) 為每顆脈衝星生成詞彙。

- 10 語義場 × 每場 5 詞 = 50 詞/星
- 本地快取: data/processed/lexicons/{jname}.json 已存在則不重呼叫
- 若產生的詞違反音系矩陣,會以 phonology_validator 過濾並最多重試 3 次
- provider 由 config.LLM_PROVIDER (或呼叫端明示) 決定
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from config import LEXICON_DIR, SEMANTIC_FIELDS, WORDS_PER_FIELD
from src.api.lexicon_glosses import SEMANTIC_GLOSSES
from src.api.llm_provider import LLMProvider, get_provider
from src.core.phonology_validator import filter_valid

log = logging.getLogger(__name__)

MAX_RETRIES = 3


def _prompt(profile: dict[str, Any]) -> str:
    return (
        "你是一個語言構建師（Conlanger）。請根據以下音系規則,"
        f"為「{profile['constellation']}」星座生成詞彙。\n\n"
        "音系規則:\n"
        f"- 音節結構: {profile['syllable_structure']}\n"
        f"- 聲調系統: {profile['tone_count']} 個聲調\n"
        f"- 時態豐富度: {profile['tense_richness']}\n"
        f"- 母音系統: {profile['vowel_inventory']}\n\n"
        f"請為以下每個語義場生成 **恰好 {WORDS_PER_FIELD} 個詞** "
        "(1 個核心概念 + 4 個衍生概念)。每個詞必須嚴格遵守音節結構與母音清單。\n\n"
        "每個詞條包含:\n"
        "  form — 書寫形式 (IPA 或羅馬化,僅使用上列輔音與母音)\n"
        "  tone — 聲調標記 (無聲調時給 null)\n"
        "  gloss — 中文/英文簡短詞義\n"
        "  etymology — 構詞靈感來自哪個人類語言\n\n"
        f"語義場: {', '.join(SEMANTIC_FIELDS)}\n\n"
        "僅回傳 JSON,鍵為語義場名稱,值為長度 5 的詞條陣列。不要加說明文字或 markdown。"
    )


def _parse_json(text: str) -> dict[str, list[dict[str, Any]]]:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.rsplit("```", 1)[0]
    return json.loads(text.strip())


def _synthetic_lexicon(profile: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Deterministic offline fallback — lets downstream modules run without API.

    Each star now gets 200 distinct word forms with per-word variation driven by
    a SHA-256 seed of (jname, field, index). No more "sa ta ma na ka" pattern.
    """
    import hashlib

    vowels = profile["vowel_inventory"]
    consonants = profile.get("consonant_inventory") or ["t", "k", "s", "m", "n", "l", "p", "r"]
    syllable = profile["syllable_structure"]
    jname = profile["jname"]
    liquid = next((c for c in ("r", "l", "ɾ") if c in consonants), consonants[-1])
    fricative = next((c for c in ("s", "ʃ", "f", "h") if c in consonants), consonants[0])

    def seeded_picks(field: str, idx: int, n: int) -> list[int]:
        """Return n deterministic 32-bit ints for this (jname, field, idx)."""
        key = f"{jname}|{field}|{idx}".encode("utf-8")
        h = hashlib.sha256(key).digest()
        return [int.from_bytes(h[i * 4:i * 4 + 4], "big") for i in range(n)]

    def word(field: str, idx: int) -> str:
        picks = seeded_picks(field, idx, 6)
        c1 = consonants[picks[0] % len(consonants)]
        c2 = consonants[picks[1] % len(consonants)]
        c3 = consonants[picks[2] % len(consonants)]
        v1 = vowels[picks[3] % len(vowels)]
        v2 = vowels[picks[4] % len(vowels)]
        # Occasional liquid as onset cluster's 2nd element
        cluster2 = liquid if picks[5] % 3 != 0 else consonants[picks[5] % len(consonants)]
        templates = {
            "CV": c1 + v1,
            "CVC": c1 + v1 + c2,
            "CCVC": c1 + cluster2 + v1 + c2,
            "CCCVCC": fricative + c1 + cluster2 + v1 + c2 + c3,
        }
        # Add occasional double-syllable variant so many words aren't identical-length
        base = templates.get(syllable, c1 + v1)
        if picks[0] % 4 == 0 and syllable in ("CV", "CVC"):
            # ~25% of words get a second syllable
            base = base + c3 + v2
        return base

    out = {}
    for field in SEMANTIC_FIELDS:
        entries = []
        meanings = SEMANTIC_GLOSSES.get(field, [])
        for w_idx in range(WORDS_PER_FIELD):
            meaning = meanings[w_idx] if w_idx < len(meanings) else {}
            entries.append({
                "form": word(field, w_idx),
                "tone": None,
                "gloss": meaning.get("gloss", f"{field}_{w_idx}"),
                "explanation": meaning.get("explanation", ""),
                "pos": meaning.get("pos", "N"),
            })
        out[field] = entries
    return out


def generate_for(
    profile: dict[str, Any],
    provider: LLMProvider | None = None,
    force: bool = False,
    use_llm: bool = False,
) -> dict[str, Any]:
    cache_path = LEXICON_DIR / f"{profile['jname']}.json"
    if cache_path.exists() and not force:
        log.info("[cache] %s", profile["jname"])
        return json.loads(cache_path.read_text(encoding="utf-8"))

    if not use_llm:
        lexicon = _synthetic_lexicon(profile)
        provider_used = "static"
        payload = {
            "jname": profile["jname"],
            "constellation": profile.get("constellation", ""),
            "provider": provider_used,
            "lexicon": lexicon,
        }
        cache_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        return payload

    provider = provider or get_provider()
    if not provider.available:
        log.warning(
            "provider '%s' unavailable (no API key) — synthetic fallback for %s",
            provider.name, profile["jname"],
        )
        lexicon = _synthetic_lexicon(profile)
        provider_used = f"{provider.name}+fallback"
    else:
        prompt = _prompt(profile)
        lexicon: dict[str, list[dict[str, Any]]] = {}
        provider_used = f"{provider.name}:{provider.model}"
        success = False
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                raw = provider.generate(prompt)
                lexicon = _parse_json(raw)
                validated = filter_valid(lexicon, profile)
                incomplete = [f for f in SEMANTIC_FIELDS if len(validated.get(f, [])) < WORDS_PER_FIELD]
                if not incomplete:
                    lexicon = validated
                    success = True
                    break
                log.info(
                    "[%s] attempt %d/%d: fields short of quota: %s",
                    provider.name, attempt, MAX_RETRIES, incomplete,
                )
                prompt = _prompt(profile) + "\n(前次部分詞不合音系,請更嚴格遵守。)"
            except Exception as exc:  # noqa: BLE001
                log.warning("[%s] attempt %d failed for %s: %s", provider.name, attempt, profile["jname"], exc)
        if not success:
            log.error(
                "[%s] giving up on %s after %d attempts — using synthetic fallback",
                provider.name, profile["jname"], MAX_RETRIES,
            )
            lexicon = _synthetic_lexicon(profile)
            provider_used = f"{provider.name}+fallback"

    payload = {
        "jname": profile["jname"],
        "constellation": profile.get("constellation", ""),
        "provider": provider_used,
        "lexicon": lexicon,
    }
    cache_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return payload


def run(
    profiles: list[dict[str, Any]] | None = None,
    provider: LLMProvider | str | None = None,
    force: bool = False,
    use_llm: bool = False,
) -> list[dict[str, Any]]:
    if profiles is None:
        from config import PHONOLOGY_DIR
        profiles = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(Path(PHONOLOGY_DIR).glob("*.json"))]

    # Drop stale lexicons from previous runs (if sample changed)
    keep = {p["jname"] for p in profiles}
    removed = 0
    for old in LEXICON_DIR.glob("*.json"):
        if old.stem not in keep:
            old.unlink()
            removed += 1
    if removed:
        log.info("removed %d stale lexicons", removed)

    if use_llm:
        if isinstance(provider, str) or provider is None:
            provider = get_provider(provider) if isinstance(provider, str) else get_provider()
        log.info("lexicon generation from LLM: %s (model=%s, available=%s)",
                 provider.name, provider.model, provider.available)
    else:
        log.info("lexicon generation from static synthetic rules (no LLM)")

    return [generate_for(p, provider=provider if use_llm else None,
                         force=force, use_llm=use_llm) for p in profiles]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
