"""§12.3 延伸: 從一顆脈衝星的音系 + 詞彙庫生成一首詩。

詩的長度由脈衝星自轉週期決定 (短週期 → 短詩),詞彙完全取自該星既有
詞彙庫,確保符合音系一致性。當 LLM 不可用時,以模板方式組合。

用法:
    python -m src.api.poem_composer --jname J0437-4715
    python -m src.api.poem_composer --all         # 為每顆星都生成一首
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
from pathlib import Path
from typing import Any

from config import LEXICON_DIR, OUTPUT_DIR, PHONOLOGY_DIR
from src.api.llm_provider import LLMProvider, get_provider

# ── Poetic templates (Chinese) for polished translation ──
# Each slot takes {a} and/or {b}/{v}/{adj} from that line's words.

_TMPL_NN = [
    "{a}與{b}。",
    "在{a}之中,{b}出現。",
    "{a}記得{b}。",
    "{a}即{b}。",
    "{a}走向{b}。",
    "{a}是{b}的倒影。",
    "{a}穿過{b}。",
    "{a}之後,總是{b}。",
    "{a}藏著{b}。",
    "{a}在{b}裡老去。",
    "沒有{b},就沒有{a}。",
    "{a},或說,{b}。",
    "{a}變成{b}。",
    "讓{a}成為{b}。",
    "{a}輕輕壓在{b}上。",
]

_TMPL_NV = [
    "{a}正在{v}。",
    "{a}曾經{v}。",
    "{a}{v}得緩慢。",
    "讓{a}{v}吧。",
    "{a}不再{v}。",
    "{a}還會{v}嗎。",
    "你看見{a}{v}。",
    "{a}繼續{v}著。",
    "{a}忘了{v}。",
    "{a}終於{v}了。",
    "一旦{a}{v},時間就停住。",
]

_TMPL_VN = [
    "{v}了{a}。",
    "被{v}的{a}。",
    "去{v}那{a}。",
    "有人在{v}{a}。",
    "終將{v}{a}。",
    "我們{v}{a}。",
]

_TMPL_NA = [
    "{a}如此{adj}。",
    "那{adj}的{a}。",
    "{a}顯得{adj}。",
    "{adj}的{a}落下來。",
    "{a}從未這樣{adj}過。",
    "{a}始終{adj}。",
]

_TMPL_AN = [
    "{adj}的{a}。",
    "{adj}且{a}。",
    "它們都很{adj},都是{a}。",
]

_TMPL_NX = [  # fallback
    "{a}與{b}。",
    "{a},以及{b}。",
    "{a}。{b}。",
]


def _rng(seed_str: str):
    """Deterministic int stream from SHA-256."""
    h = hashlib.sha256(seed_str.encode("utf-8")).digest()
    state = int.from_bytes(h[:8], "big")

    def draw(n: int) -> int:
        nonlocal state
        state = (state * 6364136223846793005 + 1442695040888963407) & ((1 << 64) - 1)
        return state % n
    return draw


def _choose(pool, draw):
    return pool[draw(len(pool))]

log = logging.getLogger(__name__)

POEMS_DIR = OUTPUT_DIR / "poems"


def _load_pulsar_data(jname: str) -> tuple[dict, dict]:
    prof_path = PHONOLOGY_DIR / f"{jname}.json"
    lex_path = LEXICON_DIR / f"{jname}.json"
    if not prof_path.exists() or not lex_path.exists():
        raise FileNotFoundError(f"missing data for {jname}")
    return (
        json.loads(prof_path.read_text(encoding="utf-8")),
        json.loads(lex_path.read_text(encoding="utf-8")),
    )


def _line_count(profile: dict[str, Any]) -> int:
    """Line count keyed to syllable structure: simple → short, complex → long."""
    mapping = {"CV": 4, "CVC": 6, "CCVC": 8, "CCCVCC": 10}
    return mapping.get(profile["syllable_structure"], 6)


def _build_prompt(profile: dict, lexicon: dict) -> str:
    lines = _line_count(profile)
    vocab = []
    for field, entries in lexicon["lexicon"].items():
        for e in entries[:3]:
            vocab.append(f"  {e.get('form', '')} ({field}:{e.get('gloss', '')})")
    return (
        f"你是一位語言詩人。以下是「{profile['constellation']}」星座的人造語言。\n\n"
        f"音系: {profile['syllable_structure']} · {profile['tone_count']} 聲調 · "
        f"母音 {profile['vowel_inventory']}\n\n"
        "可用詞彙 (每詞附語義場與中文義,你只能用這些詞或其變形):\n"
        + "\n".join(vocab) + "\n\n"
        f"請寫一首 **{lines} 行** 的短詩,主題是脈衝星的宇宙時間感:\n"
        "  - 每行僅用上列詞彙,不自創新詞。\n"
        "  - 嚴格遵守音節結構與母音清單。\n"
        "  - 回傳 JSON: {\"title\": \"...\", \"lines\": [\"...\", ...], \"translation\": [\"...\", ...]}\n"
        "  - translation 為對應每行的中文逐行譯。\n"
    )


_THEME_POOLS = {
    # 主題一致性:每首詩挑一個主題,該主題關聯的語義場佔多數詞
    "光與回歸":       ["light", "return", "celestial", "time"],
    "死亡與遺忘":     ["death", "time", "myth", "distance"],
    "節奏與時間":     ["time", "return", "direction", "density"],
    "距離與訊息":     ["distance", "contact", "direction", "light"],
    "自我與宇宙":     ["pronoun", "celestial", "myth", "return"],
    "重力與密度":     ["density", "celestial", "direction", "death"],
    "接觸與語言":     ["contact", "pronoun", "function", "myth"],
    "神話與預言":     ["myth", "time", "return", "death"],
}
_THEMES = list(_THEME_POOLS.keys())

# 詩裡常加入的「框架詞」(從 function/pronoun 抽)
_FRAME_FIELDS = {"pronoun", "function"}


def _synthetic_poem(profile: dict, lexicon: dict) -> dict[str, Any]:
    """Deterministic per-star poem.

    Strategy:
      1. Pick one overarching theme (jname-seeded).
      2. Each line = (theme word, supporting word) — supporting word usually
         comes from the theme's field cluster, occasionally from elsewhere.
      3. Word picks are weighted so the poem feels like it stays on topic.
      4. Three columns out: IPA / literal / polished.
    """
    jname = profile["jname"]
    draw = _rng(f"poem|{jname}")
    n_lines = _line_count(profile)

    all_fields = [f for f, items in lexicon.get("lexicon", {}).items() if items]
    if not all_fields:
        return {"title": profile.get("jname", ""), "lines": [], "literal": [],
                "polished": [], "translation": [], "theme": ""}

    theme_name = _choose(_THEMES, draw)
    theme_fields = [f for f in _THEME_POOLS[theme_name] if f in all_fields]
    if not theme_fields:
        theme_fields = all_fields

    raw_lines: list[str] = []
    literal_lines: list[str] = []
    polished_lines: list[str] = []

    last_field = None
    for line_i in range(n_lines):
        # 主題詞優先從 theme_fields 挑,80% 機率用主題場,20% 跳出
        primary_from_theme = draw(5) != 0
        fa = _choose(theme_fields, draw) if primary_from_theme else _choose(all_fields, draw)
        # 輔詞:略微傾向相鄰 field,且 ~20% 機率引入 pronoun/function 增添人味
        if draw(5) == 0 and "pronoun" in all_fields:
            fb = "pronoun"
        elif draw(6) == 0 and "function" in all_fields:
            fb = "function"
        else:
            # 讓兩個詞的 field 不要總是相同,但若詩行太少則允許
            candidates = [f for f in theme_fields if f != fa] or theme_fields
            fb = _choose(candidates, draw)
        # 避免連續兩行用同一對主詞 field
        if last_field == fa and len(theme_fields) > 1:
            others = [f for f in theme_fields if f != fa]
            fa = _choose(others, draw)
        last_field = fa

        # 第一詞:避免純虛詞 (X/P),允許 PRON/D 偶爾出現
        ea = None
        for _attempt in range(3):
            candidate = _choose(lexicon["lexicon"][fa], draw)
            if candidate.get("pos", "N") not in ("X", "P"):
                ea = candidate
                break
        if ea is None:
            safe = next((f for f in theme_fields if f not in _FRAME_FIELDS), theme_fields[0])
            ea = _choose(lexicon["lexicon"][safe], draw)
        # 第二詞:更嚴格,除了 X/P 也排除 D(避免「…,也地」這類怪句)
        eb = None
        for _attempt in range(4):
            candidate = _choose(lexicon["lexicon"][fb], draw)
            if candidate.get("pos", "N") not in ("X", "P", "D"):
                eb = candidate
                break
        if eb is None:
            safe = next((f for f in theme_fields if f not in _FRAME_FIELDS), theme_fields[0])
            eb = _choose(lexicon["lexicon"][safe], draw)
        a_form = ea.get("form", "")
        b_form = eb.get("form", "")
        a_gloss = ea.get("gloss", "")
        b_gloss = eb.get("gloss", "")
        a_pos = ea.get("pos", "N")
        b_pos = eb.get("pos", "N")

        raw_lines.append(f"{a_form} {b_form}.")
        literal_lines.append(f"{a_gloss} · {b_gloss}")
        polished_lines.append(_polish(a_gloss, a_pos, b_gloss, b_pos, draw))

    return {
        "title": f"{profile.get('constellation', '')} · {jname}",
        "theme": theme_name,
        "lines": raw_lines,
        "literal": literal_lines,
        "polished": polished_lines,
        # backwards compat
        "translation": polished_lines,
    }


_TMPL_PRON_V = [
    "{p}{v}。",
    "{p}也{v}。",
    "{p}從未{v}。",
    "讓{p}{v}吧。",
    "{p}還會{v}嗎。",
]
_TMPL_PRON_N = [
    "{p}的{a}。",
    "{p}看見{a}。",
    "{p}是{a}。",
    "{p}走向{a}。",
    "{p}與{a}相遇。",
    "所有{p}都記得{a}。",
]
_TMPL_N_PRON = [
    "{a}屬於{p}。",
    "{a}等待{p}。",
    "{a}與{p}相連。",
    "{a},對{p}而言,是一切。",
]
_TMPL_D = [  # 副詞 + 任何詞
    "{d}地,{b}。",
    "{b},{d}地。",
    "它{d}就{b}了。",
]


def _polish(a: str, a_pos: str, b: str, b_pos: str, draw) -> str:
    """Choose a template based on POS combination and fill it."""
    # 代詞專用模板優先(讓詩裡有「我」「你」等人味)
    if a_pos == "PRON" and b_pos == "V":
        return _choose(_TMPL_PRON_V, draw).format(p=a, v=b)
    if a_pos == "PRON" and b_pos in ("N", "PRON"):
        return _choose(_TMPL_PRON_N, draw).format(p=a, a=b)
    if a_pos in ("N", "V", "A") and b_pos == "PRON":
        if a_pos == "N":
            return _choose(_TMPL_N_PRON, draw).format(a=a, p=b)
        if a_pos == "V":
            return f"{b}{a}。"
        return f"{b}如此{a}。"

    # 副詞
    if a_pos == "D":
        return _choose(_TMPL_D, draw).format(d=a, b=b)
    if b_pos == "D":
        return f"{a},{b}地。"

    # 功能詞(連詞/介詞)當 a:通常不該獨立起頭,加最安全的並列
    if a_pos in ("X", "P"):
        return f"{b}, {a} 又是 {b}。"
    if b_pos in ("X", "P"):
        return f"{a} 也 。"

    # 核心 POS 組合
    if a_pos == "N" and b_pos == "N":
        return _choose(_TMPL_NN, draw).format(a=a, b=b)
    if a_pos == "N" and b_pos == "V":
        return _choose(_TMPL_NV, draw).format(a=a, v=b)
    if a_pos == "V" and b_pos == "N":
        return _choose(_TMPL_VN, draw).format(v=a, a=b)
    if a_pos == "N" and b_pos == "A":
        return _choose(_TMPL_NA, draw).format(a=a, adj=b)
    if a_pos == "A" and b_pos == "N":
        return _choose(_TMPL_AN, draw).format(adj=a, a=b)
    if a_pos == "V" and b_pos == "V":
        return f"{a},然後{b}。"
    if a_pos == "A" and b_pos == "A":
        return f"既{a},又{b}。"
    return _choose(_TMPL_NX, draw).format(a=a, b=b)


def _parse_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.rsplit("```", 1)[0]
    return json.loads(text.strip())


def compose(jname: str, provider: LLMProvider | None = None, use_llm: bool = False) -> dict[str, Any]:
    profile, lexicon = _load_pulsar_data(jname)
    if not use_llm:
        poem = _synthetic_poem(profile, lexicon)
        poem["_provider"] = "static"
    else:
        provider = provider or get_provider()
        if not provider.available:
            log.info("[%s] no provider key — synthetic poem", jname)
            poem = _synthetic_poem(profile, lexicon)
            poem["_provider"] = f"{provider.name}+fallback"
        else:
            try:
                raw = provider.generate(_build_prompt(profile, lexicon))
                poem = _parse_json(raw)
                poem["_provider"] = f"{provider.name}:{provider.model}"
            except Exception as exc:  # noqa: BLE001
                log.warning("[%s] generation failed: %s — synthetic", jname, exc)
                poem = _synthetic_poem(profile, lexicon)
                poem["_provider"] = f"{provider.name}+fallback"

    poem["jname"] = jname
    poem["constellation"] = profile["constellation"]
    POEMS_DIR.mkdir(parents=True, exist_ok=True)
    (POEMS_DIR / f"{jname}.json").write_text(
        json.dumps(poem, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return poem


def compose_all(provider: LLMProvider | None = None, use_llm: bool = False) -> list[dict[str, Any]]:
    jnames = [p.stem for p in sorted(PHONOLOGY_DIR.glob("*.json"))]
    source = "LLM" if use_llm else "static template"
    log.info("composing %d poems from %s", len(jnames), source)
    return [compose(j, provider=provider, use_llm=use_llm) for j in jnames]


def _format_for_console(poem: dict[str, Any]) -> str:
    title = poem.get("title") or poem.get("jname", "")
    parts = [f"\n╔═ {title} ═════════════════════════", f"║ ({poem.get('_provider', '?')})"]
    for i, line in enumerate(poem.get("lines", [])):
        tr = poem.get("translation", [])
        tr_line = tr[i] if i < len(tr) else ""
        parts.append(f"║   {line:<30}  │  {tr_line}")
    parts.append("╚" + "═" * 48)
    return "\n".join(parts)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--jname", help="compose a single pulsar's poem")
    parser.add_argument("--all", action="store_true", help="compose for every pulsar")
    parser.add_argument("--provider", choices=["anthropic", "openai", "gemini"], default=None)
    args = parser.parse_args()

    provider = get_provider(args.provider) if args.provider else get_provider()
    if args.all:
        for poem in compose_all(provider):
            print(_format_for_console(poem))
    elif args.jname:
        print(_format_for_console(compose(args.jname, provider=provider)))
    else:
        parser.error("specify --jname or --all")


if __name__ == "__main__":
    main()
