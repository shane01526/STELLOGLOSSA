"""為每顆脈衝星生一段抒情信件(§9)。

以該星的音系 + 詞彙 + 鄰居關係 + 物理參數為 context,
請 LLM 產出約 150 字的第一人稱敘事。
無 key 時走確定性模板。

用法:
    python -m src.api.letter_composer --jname J0437-4715
    python -m src.api.letter_composer --all
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
from pathlib import Path
from typing import Any

import networkx as nx

from config import DATA_PROCESSED, LEXICON_DIR, OUTPUT_DIR, PHONOLOGY_DIR
from src.api.letter_content import (
    DM_LINES,
    GREETINGS,
    LETTER_CODAS,
    LETTER_INTROS,
    LETTER_NEIGH,
    LETTER_RHYTHMS,
    LETTER_WORDS,
    PDOT_LINES,
    PERIOD_LINES,
    SIGN_TEMPLATES,
    UNIQUE_SUBTITLES,
    W50_LINES,
)
from src.api.llm_provider import LLMProvider, get_provider

log = logging.getLogger(__name__)

LETTERS_DIR = OUTPUT_DIR / "letters"


def _load_pulsar_data(jname: str) -> tuple[dict, dict, dict | None]:
    prof_path = PHONOLOGY_DIR / f"{jname}.json"
    lex_path = LEXICON_DIR / f"{jname}.json"
    pulsars = {
        p["jname"]: p
        for p in json.loads((DATA_PROCESSED / "pulsars.json").read_text(encoding="utf-8"))
    }
    if not prof_path.exists() or not lex_path.exists() or jname not in pulsars:
        raise FileNotFoundError(f"missing data for {jname}")
    return (
        json.loads(prof_path.read_text(encoding="utf-8")),
        json.loads(lex_path.read_text(encoding="utf-8")),
        pulsars[jname],
    )


def _nearest_neighbours(jname: str, k: int = 3) -> list[dict[str, Any]]:
    graph_path = OUTPUT_DIR / "contact_graph.graphml"
    if not graph_path.exists():
        return []
    G = nx.read_graphml(graph_path)
    if jname not in G:
        return []
    neigh = []
    for other, attrs in G[jname].items():
        neigh.append({
            "jname": other,
            "distance_kpc": float(attrs.get("distance_kpc", 0)),
            "regime": str(attrs.get("regime", "")),
        })
    neigh.sort(key=lambda n: n["distance_kpc"])
    return neigh[:k]


def _pick_anchor_words(lexicon: dict) -> dict[str, str]:
    """Pull one salient word per key field for the letter."""
    lex = lexicon.get("lexicon", {})
    out: dict[str, str] = {}
    for field in ("celestial", "light", "death", "return", "time"):
        entries = lex.get(field) or []
        if entries:
            out[field] = entries[0].get("form", "") or ""
    return out


def _build_prompt(profile: dict, lexicon: dict, pulsar: dict, neighbours: list[dict]) -> str:
    anchors = _pick_anchor_words(lexicon)
    anchor_lines = "\n".join(f"  - {field}: {form}" for field, form in anchors.items() if form)
    neigh_lines = "\n".join(
        f"  - {n['jname']}, {n['distance_kpc']:.2f} kpc, 關係: {n['regime']}"
        for n in neighbours
    ) or "  (沒有相鄰的脈衝星 — 它是語言孤島)"
    return (
        f"你是一位在 {pulsar['constellation']} 星座深處的脈衝星,名字叫 {pulsar['jname']}。\n"
        f"你的身體:距離地球 {pulsar['distance_kpc']:.2f} kpc,每 {pulsar['period_s']:.5f} 秒自轉一次,"
        f"色散量 {pulsar['dm']:.1f} pc/cm³,自轉減慢率 {pulsar['period_dot']:.2e},"
        f"脈衝寬度 {pulsar['w50_ms']:.2f} 毫秒。\n\n"
        "你的語言:\n"
        f"  - 音節結構: {profile['syllable_structure']}\n"
        f"  - {profile['tone_count']} 個聲調\n"
        f"  - 時態: {profile['tense_richness']}\n"
        f"  - 母音: {profile['vowel_inventory']}\n\n"
        "你的核心詞彙:\n"
        f"{anchor_lines}\n\n"
        "你的鄰居:\n"
        f"{neigh_lines}\n\n"
        "請一次生成以下五類文字,全部要避免套語與模板感,"
        "要呈現這顆星的**個別**聲音 —— 而非可套到任何脈衝星的通用敘述。\n\n"
        "1. **subtitle**: 一句為這顆星量身訂做的詩意副標,約 10~18 個中文字,"
        "混合數字/物理量與意象,像一句詩的標題。避免抽象、避免濫情。\n"
        "2. **derivations**: 四個物件 {period, dm, pdot, w50},各一段約 40~60 字,"
        "以第三人稱具象地解釋「為什麼這顆星的物理參數必然導出對應的語言特徵」。"
        "要出現這顆星的實際數值,並呈現一個具體的生活化或詩意的比喻 —— "
        "每一段都該是獨特的,不同星讀起來該有明顯差異。\n"
        "3. **greeting**: 一句書信開頭稱呼 (如「致遠方的聽者」或「從 Pictor 致」)。\n"
        "4. **body**: 第一人稱脈衝星寫給地球的信,4~6 段,每段一兩句,"
        "總計 120~180 字,要至少融入 2 個你的詞彙 (IPA 或羅馬化,附中文括註)。"
        "語氣克制、抒情、帶天文感。\n"
        "5. **signoff**: 一句署名。\n\n"
        "回傳純 JSON,**不要** markdown,**不要** 說明文字:\n"
        '{"subtitle": "...", '
        '"derivations": {"period": "...", "dm": "...", "pdot": "...", "w50": "..."}, '
        '"greeting": "...", "body": ["...", "..."], "signoff": "..."}'
    )


def _rng(jname: str):
    """Deterministic pseudo-random stream seeded by JName — same star → same text."""
    h = hashlib.sha256(jname.encode("utf-8")).digest()
    state = int.from_bytes(h[:8], "big")

    def draw(n: int) -> int:
        nonlocal state
        state = (state * 6364136223846793005 + 1442695040888963407) & ((1 << 64) - 1)
        return state % n
    return draw


def _choose(lst, draw):
    return lst[draw(len(lst))]


def _pick_subtitle(pulsar, profile, draw) -> str:
    """Use the hand-written subtitle if one exists for this jname;
    otherwise fall back to a small variable template for unseen stars."""
    jname = pulsar["jname"]
    if jname in UNIQUE_SUBTITLES:
        return UNIQUE_SUBTITLES[jname]
    p_ms = pulsar["period_s"] * 1000
    d = pulsar["distance_kpc"]
    const = pulsar["constellation"]
    fallbacks = [
        f"{const} 座 {d:.2f} kpc 外的 {p_ms:.1f} 毫秒低語",
        f"從 {const} 傳來的未知聲紋",
        f"{d:.2f} 千秒差距之外,{const} 深處的一段聲音",
    ]
    return fallbacks[draw(len(fallbacks))]


def _derivation_vars(profile, pulsar):
    p = pulsar["period_s"]
    compare = ("比你的心跳快約 " + str(int(60/p/60)) + " 倍" if p < 0.01
               else "大約和人類的呼吸節奏相當" if p < 1
               else "慢得像一聲長嘆")
    pdot_note = ("老化緩慢,近乎靜止" if pulsar["period_dot"] < 1e-19
                 else "老化溫和,有可量測的流動" if pulsar["period_dot"] < 1e-17
                 else "正在明顯衰退,時間對它格外清晰" if pulsar["period_dot"] < 1e-15
                 else "老化急促,時間像在它身上飛快流逝")
    dm_note = ("訊號幾乎不被任何塵埃干擾" if pulsar["dm"] < 10
               else "訊號穿越了適度的星際雲氣" if pulsar["dm"] < 50
               else "訊號穿越了相當厚實的介質" if pulsar["dm"] < 200
               else "訊號穿越了極密的銀河氣體與塵埃")
    tones_note = ("語言完全不帶聲調" if profile["tone_count"] == 0
                  else "語言有 2 個聲調,用音高的兩極切分意義" if profile["tone_count"] == 2
                  else "語言用 4 聲調系統組織意義" if profile["tone_count"] == 4
                  else "語言擁有極豐富的多聲調系統")
    return {
        "p": f"{p:.5f}",
        "compare": compare,
        "syll": profile["syllable_structure"],
        "spin_f": f"{1/max(p, 0.001):.1f}",
        "dm": f"{pulsar['dm']:.1f}",
        "dm_note": dm_note,
        "tones": profile["tone_count"],
        "tones_note": tones_note,
        "pdot": f"{pulsar['period_dot']:.2e}",
        "pdot_note": pdot_note,
        "tense": profile["tense_richness"],
        "w50": f"{pulsar['w50_ms']:.2f}",
        "vcount": len(profile["vowel_inventory"]),
        "vlist": "、".join(profile["vowel_inventory"]),
    }


def _synthetic_derivations(profile, pulsar, draw) -> dict[str, str]:
    v = _derivation_vars(profile, pulsar)
    return {
        "period": _choose(PERIOD_LINES, draw).format(**v),
        "dm": _choose(DM_LINES, draw).format(**v),
        "pdot": _choose(PDOT_LINES, draw).format(**v),
        "w50": _choose(W50_LINES, draw).format(**v),
    }


_WORD_ORDER_POETIC = {
    "SOV": "我把東西放在動作前面:「我 光 看見」。",
    "SVO": "我用你也熟悉的語序:「我 看見 光」。",
    "VSO": "我先說動作,再說誰在做:「看見 我 光」。",
    "VOS": "動作在最前,主詞被包在最後:「看見 光 我」。",
    "OVS": "被動的東西先說出口:「光 看見 我」。",
    "OSV": "事物先被提起,再說誰和怎樣:「光 我 看見」。",
}

def _synthetic_body(profile, lexicon, pulsar, neighbours, draw) -> list[str]:
    anchors = _pick_anchor_words(lexicon)
    v = {
        "const": pulsar["constellation"],
        "dist": f"{pulsar['distance_kpc']:.2f}",
        "j": pulsar["jname"],
        "p": f"{pulsar['period_s']:.5f}",
        "syll": profile["syllable_structure"],
        "comp": ("像心跳,只是更快" if pulsar["period_s"] < 0.01
                  else "像你講話的速度" if pulsar["period_s"] < 1
                  else "像一聲拉得很長的嘆息"),
        "light": anchors.get("light") or "ta",
        "death": anchors.get("death") or "ki",
        "ret": anchors.get("return") or "ata",
        "time": anchors.get("time") or "u",
        "spin": int(1 / max(pulsar["period_s"], 0.001) * 3),
    }
    if neighbours:
        n = neighbours[0]
        v.update({
            "nj": n["jname"],
            "nd": f"{n['distance_kpc']:.2f}",
            "nr": ({"borrowing": "借用", "extension": "擴展", "narrowing": "縮減", "isolation": "孤立"}).get(n.get("regime", ""), "接觸"),
        })

    # Grammar-aware extra line so each star's letter hints at its own syntax.
    order = profile.get("grammar", {}).get("word_order", "SVO")
    grammar_line = _WORD_ORDER_POETIC.get(order, "")

    intro = _choose(LETTER_INTROS, draw).format(**v)
    rhythm = _choose(LETTER_RHYTHMS, draw).format(**v)
    words = _choose(LETTER_WORDS, draw).format(**v)

    # Insert soft connective particles to improve flow
    connectives = ["也因為如此,", "於是,", "而且,", "但,", "不過,", "然而,"]
    rhythm = _choose(connectives, draw) + rhythm

    lines = [intro, rhythm, words]
    if grammar_line:
        lines.insert(3, grammar_line)
    if neighbours:
        lines.append(_choose(LETTER_NEIGH[:-1], draw).format(**v))
    else:
        lines.append(LETTER_NEIGH[-1])  # 「附近沒有鄰居」
    lines.append(_choose(LETTER_CODAS, draw).format(**v))
    return lines


def _synthetic_letter(profile: dict, lexicon: dict, pulsar: dict, neighbours: list[dict]) -> dict[str, Any]:
    draw = _rng(pulsar["jname"])
    return {
        "subtitle": _pick_subtitle(pulsar, profile, draw),
        "derivations": _synthetic_derivations(profile, pulsar, draw),
        "greeting": _choose(GREETINGS, draw).format(const=pulsar["constellation"], j=pulsar["jname"]),
        "body": _synthetic_body(profile, lexicon, pulsar, neighbours, draw),
        "signoff": _choose(SIGN_TEMPLATES, draw).format(j=pulsar["jname"], const=pulsar["constellation"]),
    }


def _parse_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.rsplit("```", 1)[0]
    return json.loads(text.strip())


def compose(jname: str, provider: LLMProvider | None = None, use_llm: bool = False) -> dict[str, Any]:
    profile, lexicon, pulsar = _load_pulsar_data(jname)
    neighbours = _nearest_neighbours(jname, k=3)

    if not use_llm:
        letter = _synthetic_letter(profile, lexicon, pulsar, neighbours)
        letter["_provider"] = "static"
    else:
        provider = provider or get_provider()
        if not provider.available:
            letter = _synthetic_letter(profile, lexicon, pulsar, neighbours)
            letter["_provider"] = f"{provider.name}+fallback"
        else:
            try:
                raw = provider.generate(_build_prompt(profile, lexicon, pulsar, neighbours))
                letter = _parse_json(raw)
                if not (isinstance(letter.get("body"), list) and letter["body"]):
                    raise ValueError("missing body")
                synth = _synthetic_letter(profile, lexicon, pulsar, neighbours)
                for key in ("subtitle", "derivations", "greeting", "signoff"):
                    letter.setdefault(key, synth[key])
                if isinstance(letter.get("derivations"), dict):
                    for k in ("period", "dm", "pdot", "w50"):
                        letter["derivations"].setdefault(k, synth["derivations"][k])
                else:
                    letter["derivations"] = synth["derivations"]
                letter["_provider"] = f"{provider.name}:{provider.model}"
            except Exception as exc:  # noqa: BLE001
                log.warning("[%s] letter generation failed: %s — synthetic", jname, exc)
                letter = _synthetic_letter(profile, lexicon, pulsar, neighbours)
                letter["_provider"] = f"{provider.name}+fallback"

    letter["jname"] = jname
    letter["constellation"] = profile.get("constellation", "")
    LETTERS_DIR.mkdir(parents=True, exist_ok=True)
    (LETTERS_DIR / f"{jname}.json").write_text(
        json.dumps(letter, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return letter


def compose_all(provider: LLMProvider | None = None, use_llm: bool = False) -> list[dict[str, Any]]:
    jnames = [p.stem for p in sorted(PHONOLOGY_DIR.glob("*.json"))]
    source = "LLM" if use_llm else "static content module"
    log.info("composing %d letters from %s", len(jnames), source)
    return [compose(j, provider=provider, use_llm=use_llm) for j in jnames]


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--jname")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--provider", choices=["anthropic", "openai", "gemini"], default=None)
    parser.add_argument("--use-llm", action="store_true",
                        help="override default: call LLM provider instead of using the static content pool")
    args = parser.parse_args()
    provider = get_provider(args.provider) if args.provider else None
    if args.all:
        for l in compose_all(provider, use_llm=args.use_llm):
            print(f"[{l['jname']}] {l.get('_provider')}")
    elif args.jname:
        letter = compose(args.jname, provider=provider, use_llm=args.use_llm)
        print(json.dumps(letter, indent=2, ensure_ascii=False))
    else:
        parser.error("specify --jname or --all")


if __name__ == "__main__":
    main()
