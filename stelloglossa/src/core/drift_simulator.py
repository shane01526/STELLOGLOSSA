"""Module 4 續: 跨星語義漂移模擬。

以接觸圖的權重,迭代讓每顆星的語義向量向鄰居靠近（類似 label propagation）。
每步保留一個快照,最後匯出 .npy 與摘要 JSON。
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import networkx as nx
import numpy as np

from config import OUTPUT_DIR

log = logging.getLogger(__name__)


def simulate(
    graph: nx.Graph,
    vectors: np.ndarray,
    records: list[dict[str, Any]],
    steps: int = 5,
    alpha: float = 0.15,
) -> np.ndarray:
    """Label-propagation-like drift.

    vectors[i] ← (1-α) vectors[i] + α · weighted_mean(neighbours' matching-field vectors)
    Matching on (jname, field) so borrowing happens between equivalent concepts.
    """
    n = len(records)
    field_index: dict[tuple[str, str], int] = {
        (r["jname"], r["field"]): i for i, r in enumerate(records)
    }

    snapshots = np.zeros((steps + 1, n, vectors.shape[1]), dtype=np.float32)
    snapshots[0] = vectors.copy()
    current = vectors.copy()

    for step in range(1, steps + 1):
        next_vecs = current.copy()
        for i, rec in enumerate(records):
            jname = rec["jname"]
            field = rec["field"]
            if jname not in graph:
                continue
            accum = np.zeros(vectors.shape[1], dtype=np.float32)
            wsum = 0.0
            for neighbour, data in graph[jname].items():
                key = (neighbour, field)
                if key in field_index:
                    w = float(data.get("weight", 0.0))
                    accum += w * current[field_index[key]]
                    wsum += w
            if wsum > 0:
                accum /= wsum
                next_vecs[i] = (1 - alpha) * current[i] + alpha * accum
                norm = np.linalg.norm(next_vecs[i])
                if norm > 0:
                    next_vecs[i] /= norm
        current = next_vecs
        snapshots[step] = current
        log.info("drift step %d done", step)

    return snapshots


def _asymmetry_report(
    graph: nx.Graph, initial: np.ndarray, final: np.ndarray,
    records: list[dict[str, Any]], profiles: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """H3: compare drift magnitude between low-complexity and high-complexity partners."""
    field_index = {(r["jname"], r["field"]): i for i, r in enumerate(records)}
    report = []
    for u, v, data in graph.edges(data=True):
        cu = profiles.get(u, {}).get("complexity_score", 0)
        cv = profiles.get(v, {}).get("complexity_score", 0)
        if cu == cv:
            continue
        low, high = (u, v) if cu < cv else (v, u)
        per_field = []
        for field in {f for _, f in field_index if _ in (low, high)}:
            li = field_index.get((low, field))
            hi = field_index.get((high, field))
            if li is None or hi is None:
                continue
            low_drift = float(np.linalg.norm(final[li] - initial[li]))
            high_drift = float(np.linalg.norm(final[hi] - initial[hi]))
            per_field.append({"field": field, "low_drift": low_drift, "high_drift": high_drift})
        report.append({
            "low_complexity": low, "high_complexity": high,
            "distance_kpc": data.get("distance_kpc"),
            "per_field": per_field,
        })
    return report


def run(
    graph_path: Path | None = None,
    embeddings_path: Path | None = None,
    profiles_dir: Path | None = None,
    steps: int = 5,
) -> Path:
    from config import PHONOLOGY_DIR

    graph_file = graph_path or (OUTPUT_DIR / "contact_graph.graphml")
    embed_file = embeddings_path or (OUTPUT_DIR / "embeddings.npz")

    graph = nx.read_graphml(graph_file)
    data = np.load(embed_file, allow_pickle=True)
    vectors = data["vectors"]
    records = json.loads(str(data["records"]))

    profiles = {}
    prof_dir = profiles_dir or PHONOLOGY_DIR
    for p in prof_dir.glob("*.json"):
        payload = json.loads(p.read_text(encoding="utf-8"))
        profiles[payload["jname"]] = payload

    snapshots = simulate(graph, vectors, records, steps=steps)
    out_npy = OUTPUT_DIR / "drift_snapshots.npy"
    np.save(out_npy, snapshots)

    report = _asymmetry_report(graph, snapshots[0], snapshots[-1], records, profiles)
    report_path = OUTPUT_DIR / "drift_asymmetry.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    log.info("drift artefacts: %s, %s", out_npy, report_path)
    return out_npy


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
