"""H1/H2/H3 假說的統計檢定。

H1: 高 DM 的脈衝星,聲調數量較多,且在接觸網絡中度數較高。
H2: 「光」類詞傾向高前母音,「死亡」類詞傾向低後母音 (跨全部 50 顆)。
H3: 音系複雜度低的語言會不對稱地向高複雜度語言借用,
    且借用以「時間」「死亡」語義場為優先 (以漂移量替代)。
"""
from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import networkx as nx
import numpy as np
from scipy import stats

from config import DATA_PROCESSED, OUTPUT_DIR, PHONOLOGY_DIR, SEMANTIC_FIELDS

log = logging.getLogger(__name__)

HIGH_FRONT_VOWELS = {"i", "y", "ɪ", "e", "ɛ"}
LOW_BACK_VOWELS = {"a", "ɑ", "u", "o", "ɔ", "ã"}

LIGHT_FIELDS = ("light", "return")
DEATH_FIELDS = ("death", "density")


@dataclass
class HypothesisResult:
    name: str
    passed: bool
    statistic: float
    p_value: float
    effect_size: float | None
    notes: str


def _load_profiles() -> list[dict[str, Any]]:
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(PHONOLOGY_DIR.glob("*.json"))]


def _load_lexicons() -> list[dict[str, Any]]:
    from config import LEXICON_DIR
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(LEXICON_DIR.glob("*.json"))]


def _load_pulsars() -> list[dict[str, Any]]:
    return json.loads((DATA_PROCESSED / "pulsars.json").read_text(encoding="utf-8"))


def _load_graph() -> nx.Graph:
    return nx.read_graphml(OUTPUT_DIR / "contact_graph.graphml")


def test_h1_dm_vs_complexity(
    pulsars: list[dict[str, Any]],
    profiles: list[dict[str, Any]],
    graph: nx.Graph,
) -> HypothesisResult:
    """High DM ↔ more tones ↔ higher network degree."""
    dm_values = []
    tone_counts = []
    degrees = []
    profile_by_jname = {p["jname"]: p for p in profiles}
    for pulsar in pulsars:
        prof = profile_by_jname.get(pulsar["jname"])
        if not prof:
            continue
        dm_values.append(pulsar["dm"])
        tone_counts.append(prof["tone_count"])
        degrees.append(graph.degree(pulsar["jname"]) if pulsar["jname"] in graph else 0)

    # Mann-Whitney: split DM by median, compare tone counts
    median_dm = np.median(dm_values)
    low = [t for t, d in zip(tone_counts, dm_values) if d <= median_dm]
    high = [t for t, d in zip(tone_counts, dm_values) if d > median_dm]
    u_stat, p_val = stats.mannwhitneyu(high, low, alternative="greater") if low and high else (0.0, 1.0)

    # Spearman rho: DM vs degree
    rho, rho_p = stats.spearmanr(dm_values, degrees) if len(dm_values) >= 3 else (0.0, 1.0)

    passed = bool(p_val < 0.05 and rho > 0)
    return HypothesisResult(
        name="H1: 銀河核心語言複雜度",
        passed=passed,
        statistic=float(u_stat),
        p_value=float(p_val),
        effect_size=float(rho),
        notes=(
            f"Mann-Whitney U={u_stat:.1f} (high DM 聲調數 > low DM? p={p_val:.4f}); "
            f"Spearman ρ(DM, degree)={rho:.3f} p={rho_p:.4f}"
        ),
    )


def _vowel_category(word: str) -> tuple[int, int]:
    """Return (front_high_count, back_low_count) for vowels in the word."""
    fh = sum(1 for c in word if c in HIGH_FRONT_VOWELS)
    bl = sum(1 for c in word if c in LOW_BACK_VOWELS)
    return fh, bl


def test_h2_sound_symbolism(lexicons: list[dict[str, Any]]) -> HypothesisResult:
    """Chi-square on 2x2 (field_class × vowel_class)."""
    light_fh = light_bl = death_fh = death_bl = 0
    for payload in lexicons:
        lex = payload.get("lexicon", {})
        for field in LIGHT_FIELDS:
            for entry in lex.get(field, []):
                fh, bl = _vowel_category(entry.get("form", ""))
                light_fh += fh
                light_bl += bl
        for field in DEATH_FIELDS:
            for entry in lex.get(field, []):
                fh, bl = _vowel_category(entry.get("form", ""))
                death_fh += fh
                death_bl += bl

    table = np.array([[light_fh, light_bl], [death_fh, death_bl]])
    if table.sum() == 0 or (table.sum(axis=0) == 0).any() or (table.sum(axis=1) == 0).any():
        return HypothesisResult(
            name="H2: 聲象徵的宇宙版本",
            passed=False, statistic=0.0, p_value=1.0, effect_size=0.0,
            notes="insufficient vowel data",
        )
    chi2, p_val, _, _ = stats.chi2_contingency(table)
    n = table.sum()
    cramers_v = float(np.sqrt(chi2 / n))  # 2x2 table
    # H2 passes if: distribution differs significantly AND direction matches
    #   light 偏高前母音 (fh/bl > 1), death 偏低後母音 (bl/fh > 1)
    light_ratio = light_fh / max(light_bl, 1)
    death_ratio = death_bl / max(death_fh, 1)
    direction_ok = bool(light_ratio > 1 and death_ratio > 1)
    passed = bool(p_val < 0.05) and direction_ok
    return HypothesisResult(
        name="H2: 聲象徵的宇宙版本",
        passed=passed,
        statistic=float(chi2),
        p_value=float(p_val),
        effect_size=cramers_v,
        notes=(
            f"2x2 χ²={chi2:.2f} p={p_val:.4f}, Cramér's V={cramers_v:.3f}; "
            f"light fh/bl={light_ratio:.2f}, death bl/fh={death_ratio:.2f}; "
            f"table={table.tolist()}"
        ),
    )


def test_h3_borrowing_asymmetry() -> HypothesisResult:
    """Read drift_asymmetry.json and test if low-complexity → high-complexity
    drift is larger than the reverse, especially for time/death fields."""
    report_path = OUTPUT_DIR / "drift_asymmetry.json"
    if not report_path.exists():
        return HypothesisResult(
            name="H3: 借用不對稱性",
            passed=False, statistic=0.0, p_value=1.0, effect_size=None,
            notes="drift_asymmetry.json not found — run drift stage first",
        )
    entries = json.loads(report_path.read_text(encoding="utf-8"))
    priority = {"time", "death"}
    low_drifts, high_drifts = [], []
    priority_low, priority_high = [], []
    for pair in entries:
        for f in pair.get("per_field", []):
            low_drifts.append(f["low_drift"])
            high_drifts.append(f["high_drift"])
            if f["field"] in priority:
                priority_low.append(f["low_drift"])
                priority_high.append(f["high_drift"])

    if not low_drifts:
        return HypothesisResult(
            name="H3: 借用不對稱性",
            passed=False, statistic=0.0, p_value=1.0, effect_size=None,
            notes="no complexity-asymmetric pairs",
        )

    # Wilcoxon signed-rank: is low-complexity drift > high-complexity drift (per pair)?
    stat, p_val = stats.wilcoxon(low_drifts, high_drifts, alternative="greater") \
        if len(low_drifts) >= 10 else (0.0, 1.0)
    mean_low = float(np.mean(low_drifts))
    mean_high = float(np.mean(high_drifts))
    priority_ratio = (
        float(np.mean(priority_low) / max(np.mean(priority_high), 1e-9))
        if priority_low and priority_high else 0.0
    )
    passed = bool(p_val < 0.05 and mean_low > mean_high)
    return HypothesisResult(
        name="H3: 借用不對稱性",
        passed=passed,
        statistic=float(stat),
        p_value=float(p_val),
        effect_size=float(mean_low - mean_high),
        notes=(
            f"Wilcoxon W={stat:.1f} p={p_val:.4f}; "
            f"mean drift low={mean_low:.4f} vs high={mean_high:.4f}; "
            f"priority(time+death) low/high ratio={priority_ratio:.2f}"
        ),
    )


def run() -> dict[str, Any]:
    pulsars = _load_pulsars()
    profiles = _load_profiles()
    lexicons = _load_lexicons()
    graph = _load_graph()

    results = [
        test_h1_dm_vs_complexity(pulsars, profiles, graph),
        test_h2_sound_symbolism(lexicons),
        test_h3_borrowing_asymmetry(),
    ]
    out = {
        "summary": {
            "n_pulsars": len(pulsars),
            "n_lexicons": len(lexicons),
            "graph_edges": graph.number_of_edges(),
        },
        "results": [asdict(r) for r in results],
    }
    path = OUTPUT_DIR / "hypothesis_results.json"
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    log.info("wrote %s", path)
    return out


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
