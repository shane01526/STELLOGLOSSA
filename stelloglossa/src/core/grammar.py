"""每顆脈衝星的「文法」—— 由 jname hash 確定性決定,保證每顆不同。

Fields:
  word_order          SOV / SVO / VSO / VOS / OSV / OVS  (分布依人類語言頻率加權)
  adjective_position  before / after
  negation            prefix / suffix / particle-before / particle-after
  tense_marker        前綴 / 後綴 / particle / none
  plural_marker       suffix / reduplication / none
  question_marker     final-particle / initial-particle / intonation
  possessive          N-of-N / NN-concat
  vowel_harmony       None / front-back / round
  emphasis_position   initial / final

確定性:同一 jname 每次跑結果相同。
"""
from __future__ import annotations

import hashlib
from typing import Any

# Weighted distributions (approximate frequencies in the world's languages)
_WORD_ORDER = [
    ("SOV", 0.41), ("SVO", 0.35), ("VSO", 0.08), ("VOS", 0.02),
    ("OVS", 0.01), ("OSV", 0.01),
]
# Normalised for the 0..1 ranges we'll draw against
_WORD_ORDER_TOTAL = sum(w for _, w in _WORD_ORDER)

_ADJ_POS = ["before", "after"]             # 50/50
_NEGATION = ["particle-before", "particle-after", "prefix", "suffix"]
_TENSE_MARKER = ["prefix", "suffix", "particle", "none"]
_PLURAL_MARKER = ["suffix", "reduplication", "none"]
_QUESTION_MARKER = ["final-particle", "initial-particle", "intonation"]
_POSSESSIVE = ["N-of-N", "NN-concat"]
_VOWEL_HARMONY = ["none", "none", "none", "front-back", "round"]  # rarer than not
_EMPHASIS_POS = ["initial", "final"]


def _rng(jname: str):
    """Deterministic stream of ints 0..2^32 seeded by jname."""
    h = hashlib.sha256(jname.encode("utf-8")).digest()
    state = int.from_bytes(h[:8], "big") ^ 0xDEADBEEFCAFEBABE
    def draw() -> int:
        nonlocal state
        state = (state * 6364136223846793005 + 1442695040888963407) & ((1 << 64) - 1)
        return state
    return draw


def _pick(draw, options):
    return options[draw() % len(options)]


def _pick_weighted(draw, options):
    """options: [(value, weight), ...]"""
    total = sum(w for _, w in options)
    r = (draw() / 0xFFFFFFFFFFFFFFFF) * total
    acc = 0.0
    for v, w in options:
        acc += w
        if r <= acc:
            return v
    return options[-1][0]


def build_grammar(jname: str) -> dict[str, Any]:
    draw = _rng(jname)
    return {
        "word_order": _pick_weighted(draw, _WORD_ORDER),
        "adjective_position": _pick(draw, _ADJ_POS),
        "negation": _pick(draw, _NEGATION),
        "tense_marker": _pick(draw, _TENSE_MARKER),
        "plural_marker": _pick(draw, _PLURAL_MARKER),
        "question_marker": _pick(draw, _QUESTION_MARKER),
        "possessive": _pick(draw, _POSSESSIVE),
        "vowel_harmony": _pick(draw, _VOWEL_HARMONY),
        "emphasis_position": _pick(draw, _EMPHASIS_POS),
    }


def grammar_summary_cn(g: dict[str, Any]) -> str:
    """Short human-readable Chinese description,用於前端 card / 詳細頁。"""
    tense_tc = {"prefix": "前綴", "suffix": "後綴", "particle": "助詞", "none": "無"}
    neg_tc = {"prefix": "前綴", "suffix": "後綴",
              "particle-before": "否定詞前置", "particle-after": "否定詞後置"}
    return (
        f"語序 {g['word_order']} · 形容詞{'前' if g['adjective_position'] == 'before' else '後'}置 · "
        f"時態以{tense_tc[g['tense_marker']]}標記 · 否定{neg_tc[g['negation']]}"
    )
