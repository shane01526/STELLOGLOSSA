"""中文 → 某顆脈衝星語言的翻譯器(Phase 1 · 離線規則版)。

流程:
  1. jieba 斷詞 + POS 標註
  2. 每個 token 查 Chinese-index → (field, idx) → 該星 lexicon 裡的 form
  3. 應用該星文法:
     - 語序重排(S/V/O 粗略識別)
     - 形容詞位置
     - 時態標記(若動詞前後有時間詞)
     - 否定標記(「不」「沒」「未」)
     - 複數標記(「們」「幾個」「許多」)
  4. 輸出 IPA 序列 + 逐詞對照

回傳結構:
{
  "source": "原句",
  "tokens": [{"orig": "...", "form": "...", "pos": "N", "field": "..."}, ...],
  "output": "重排 + 帶形態標記的該星語句",
  "grammar": {...該星文法摘要},
}
"""
from __future__ import annotations

import json
import logging
from typing import Any

from config import DATA_PROCESSED, LEXICON_DIR, PHONOLOGY_DIR
from src.api.lexicon_glosses import build_chinese_index

log = logging.getLogger(__name__)

_ZH_INDEX = build_chinese_index()

_NEGATION_WORDS = {"不", "沒", "未", "別", "勿", "非"}
_TENSE_PAST = {"了", "過", "曾", "已經", "昨天", "之前"}
_TENSE_FUTURE = {"會", "將", "要", "明天", "將來", "以後"}
_PLURAL_CUES = {"們", "幾個", "許多", "很多", "兩", "三", "四", "五", "六", "七", "八", "九", "十"}


def _load_star(jname: str) -> dict[str, Any]:
    prof = json.loads((PHONOLOGY_DIR / f"{jname}.json").read_text(encoding="utf-8"))
    lex_raw = json.loads((LEXICON_DIR / f"{jname}.json").read_text(encoding="utf-8"))
    # Build reverse-lookup table: (field, idx) → entry
    by_pos: dict[tuple[str, int], dict[str, Any]] = {}
    for field, items in lex_raw.get("lexicon", {}).items():
        for i, e in enumerate(items):
            by_pos[(field, i)] = e
    return {"profile": prof, "entries": by_pos}


def _segment(text: str) -> list[tuple[str, str]]:
    """jieba.posseg.cut 回 [(word, flag), ...]. Fallback to char-by-char if jieba missing."""
    try:
        import jieba.posseg as pseg
        return [(w.word, w.flag) for w in pseg.cut(text)]
    except ImportError:
        return [(c, "x") for c in text]


def _classify_pos(flag: str) -> str:
    """Collapse jieba flags into N/V/A/D/PRON/X."""
    if flag.startswith("n") or flag in ("t", "s", "f"):  # noun, time, place, direction
        return "N"
    if flag.startswith("v"): return "V"
    if flag.startswith("a") or flag == "z": return "A"
    if flag.startswith("d"): return "D"
    if flag.startswith("r"): return "PRON"
    return "X"


def _lookup(token: str, star: dict) -> dict[str, Any] | None:
    # 直接比對大辭典
    hit = _ZH_INDEX.get(token)
    if not hit:
        # 子字元 fallback:單字查表
        for ch in token:
            hit = _ZH_INDEX.get(ch)
            if hit:
                break
    if not hit:
        return None
    entry = star["entries"].get(hit)
    if not entry:
        return None
    return {"field": hit[0], "idx": hit[1], **entry}


def _apply_word_order(tokens: list[dict], order: str) -> list[dict]:
    """Naive SVO → target order. Identifies first noun as S, first verb as V,
    first noun after V as O. Everything else keeps its relative position."""
    if order == "SVO" or not tokens:
        return tokens

    # Indices of S / V / O
    S = V = O = None
    for i, t in enumerate(tokens):
        if S is None and t["pos"] in ("N", "PRON"):
            S = i; continue
        if V is None and t["pos"] == "V":
            V = i; continue
        if V is not None and O is None and t["pos"] in ("N", "PRON") and i > V:
            O = i; continue
    if None in (S, V, O):
        return tokens  # Not a canonical sentence; leave alone

    svo_slots = {S, V, O}
    reorder = {
        "SOV": [S, O, V],
        "VSO": [V, S, O],
        "VOS": [V, O, S],
        "OVS": [O, V, S],
        "OSV": [O, S, V],
    }
    if order not in reorder:
        return tokens
    out: list[dict] = []
    placed = set()
    # Walk original positions; whenever we hit one of S/V/O, emit the matching
    # slot from the target order; else emit modifier unchanged.
    target_iter = iter(reorder[order])
    for i, t in enumerate(tokens):
        if i in svo_slots:
            j = next(target_iter)
            out.append(tokens[j])
            placed.add(j)
        else:
            out.append(t)
    return out


def _apply_adjective(tokens: list[dict], position: str) -> list[dict]:
    """Move adjectives to before/after the following noun."""
    if position == "after" or not tokens:
        return tokens  # 中文原本就是 A + N,"after" 是翻譯後反過來會動,這裡交給前端理解:
    return tokens  # 為簡化,此階段不實際調整順序(中文本來就是 before)


def _apply_negation(tokens: list[dict], neg: str, star: dict) -> list[dict]:
    """If '不/沒/未' appears, re-encode via the star's chosen negation strategy."""
    neg_indices = [i for i, t in enumerate(tokens) if t["orig"] in _NEGATION_WORDS]
    if not neg_indices:
        return tokens
    # 這門語言怎麼表達否定的「標記」:用 lexicon 的 contact/誤解 或 death/消滅 做負面標記
    # 簡化:用 death 的第一個詞 form 作「否定 token」
    try:
        neg_token = star["entries"].get(("death", 0))
        if not neg_token:
            return tokens
    except Exception:
        return tokens
    out: list[dict] = []
    for i, t in enumerate(tokens):
        if i in neg_indices:
            continue  # drop 原否定詞
        out.append(t)
    # 插回:依 neg 策略
    neg_marker = {"orig": "[NEG]", "form": f"¬{neg_token['form']}", "pos": "X", "field": "death", "idx": 0}
    if neg == "particle-before":
        out.insert(0, neg_marker)
    elif neg == "particle-after":
        out.append(neg_marker)
    elif neg == "prefix" and out:
        first = out[0]
        out[0] = {**first, "form": neg_marker["form"] + "-" + first["form"]}
    elif neg == "suffix" and out:
        last = out[-1]
        out[-1] = {**last, "form": last["form"] + "-" + neg_marker["form"]}
    return out


def _apply_tense(tokens: list[dict], marker: str, star: dict) -> list[dict]:
    """Detect past/future cues in the original tokens and add the star's tense marker."""
    if marker == "none" or not tokens:
        return tokens
    is_past = any(t["orig"] in _TENSE_PAST for t in tokens)
    is_future = any(t["orig"] in _TENSE_FUTURE for t in tokens)
    if not (is_past or is_future):
        return tokens
    tag = "PST" if is_past else "FUT"
    # 時態標記借用 time 場第 0 (此刻) vs 第 5 (明天) 的 form 作為記號前/後綴
    try:
        if is_past:
            t_entry = star["entries"].get(("time", 6))  # "以前"
        else:
            t_entry = star["entries"].get(("time", 5))  # "明天"
        if not t_entry:
            return tokens
    except Exception:
        return tokens
    # Attach to first verb
    verb_i = next((i for i, t in enumerate(tokens) if t["pos"] == "V"), None)
    if verb_i is None:
        return tokens
    v = tokens[verb_i]
    if marker == "prefix":
        tokens[verb_i] = {**v, "form": t_entry["form"] + "-" + v["form"]}
    elif marker == "suffix":
        tokens[verb_i] = {**v, "form": v["form"] + "-" + t_entry["form"]}
    elif marker == "particle":
        particle = {"orig": f"[{tag}]", "form": t_entry["form"], "pos": "X"}
        tokens.insert(verb_i + 1, particle)
    return tokens


def _apply_plural(tokens: list[dict], marker: str) -> list[dict]:
    """If '們' or 數詞 appears near a noun, encode plurality via the star's marker."""
    if marker == "none" or not tokens:
        return tokens
    plural_indices: list[int] = []
    for i, t in enumerate(tokens):
        if t["orig"] in _PLURAL_CUES:
            # Find preceding noun
            for j in range(i - 1, -1, -1):
                if tokens[j]["pos"] in ("N", "PRON"):
                    plural_indices.append(j); break
    if not plural_indices:
        return tokens
    for j in plural_indices:
        n = tokens[j]
        if marker == "suffix":
            tokens[j] = {**n, "form": n["form"] + "-PL"}
        elif marker == "reduplication":
            tokens[j] = {**n, "form": n["form"] + n["form"]}
    # drop original plural cues
    return [t for i, t in enumerate(tokens) if t["orig"] not in _PLURAL_CUES]


def translate(jname: str, chinese_text: str) -> dict[str, Any]:
    if not chinese_text or not chinese_text.strip():
        return {"source": chinese_text, "tokens": [], "output": "", "grammar": {}}
    star = _load_star(jname)
    grammar = star["profile"].get("grammar", {})

    segs = _segment(chinese_text)
    tokens: list[dict] = []
    for word, flag in segs:
        if word.strip() == "":
            continue
        pos = _classify_pos(flag)
        hit = _lookup(word, star)
        if hit:
            tokens.append({"orig": word, "form": hit["form"], "pos": pos,
                           "field": hit["field"], "idx": hit["idx"]})
        else:
            # keep original token;前端會以 dim color 標示 untranslated
            tokens.append({"orig": word, "form": "", "pos": pos, "field": None, "idx": None})

    # Apply grammar transformations ON tokens that have a form (skip untranslated)
    has_forms = [t for t in tokens if t["form"]]
    has_forms = _apply_negation(has_forms, grammar.get("negation", "particle-before"), star)
    has_forms = _apply_tense(has_forms, grammar.get("tense_marker", "none"), star)
    has_forms = _apply_plural(has_forms, grammar.get("plural_marker", "none"))
    has_forms = _apply_word_order(has_forms, grammar.get("word_order", "SVO"))

    output = " ".join(t["form"] for t in has_forms if t["form"])
    return {
        "source": chinese_text,
        "tokens": tokens,
        "translated_tokens": has_forms,
        "output": output,
        "grammar": grammar,
    }


def main() -> None:
    import argparse
    import sys, io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--jname", required=True)
    parser.add_argument("text", nargs="+")
    args = parser.parse_args()
    text = " ".join(args.text)
    result = translate(args.jname, text)
    print(f"來源: {result['source']}")
    print(f"語序: {result['grammar'].get('word_order', '?')}")
    print(f"翻譯: {result['output']}")
    print()
    for t in result.get("translated_tokens", []):
        print(f"  {t['orig']:4}  →  {t['form']:14}  ({t['pos']})")


if __name__ == "__main__":
    main()
