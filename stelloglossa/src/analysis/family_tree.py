"""語言家譜樹: 以音系特徵做 hierarchical clustering。

特徵向量 (5 維):
  - syllable_length   音節模板字元數 (2~6)
  - tone_count        聲調數量
  - tense_level       時態豐富度等級 (0~3)
  - vowel_count       母音數
  - dm                色散量 log10

採 Ward linkage + Euclidean,並輸出兩種格式:
  - language_tree.json   D3 hierarchy 格式 (巢狀)
  - language_tree.nwk    Newick string,可進 FigTree / Dendroscope
"""
from __future__ import annotations

import json
import logging
import math
from pathlib import Path
from typing import Any

import numpy as np
from scipy.cluster.hierarchy import linkage, to_tree
from scipy.spatial.distance import pdist

from config import DATA_PROCESSED, OUTPUT_DIR, PHONOLOGY_DIR, TENSE_RICHNESS

log = logging.getLogger(__name__)

JSON_PATH = OUTPUT_DIR / "language_tree.json"
NEWICK_PATH = OUTPUT_DIR / "language_tree.nwk"


def _feature_vector(profile: dict[str, Any], dm: float) -> list[float]:
    tense_level = TENSE_RICHNESS.index(profile["tense_richness"]) if profile["tense_richness"] in TENSE_RICHNESS else 0
    return [
        len(profile["syllable_structure"]),
        profile["tone_count"],
        tense_level,
        len(profile["vowel_inventory"]),
        math.log10(max(dm, 0.1)),
    ]


def _scipy_to_d3(node, labels: list[str]) -> dict[str, Any]:
    """Convert scipy ClusterNode to D3 hierarchy-compatible dict."""
    if node.is_leaf():
        return {"name": labels[node.id], "leaf": True, "height": 0.0}
    return {
        "name": f"node_{node.id}",
        "leaf": False,
        "height": float(node.dist),
        "children": [_scipy_to_d3(node.left, labels), _scipy_to_d3(node.right, labels)],
    }


def _scipy_to_newick(node, labels: list[str], parent_dist: float = 0.0) -> str:
    if node.is_leaf():
        return f"{labels[node.id]}:{parent_dist - node.dist:.4f}"
    left = _scipy_to_newick(node.left, labels, node.dist)
    right = _scipy_to_newick(node.right, labels, node.dist)
    branch = max(parent_dist - node.dist, 0.0)
    return f"({left},{right}):{branch:.4f}"


def run() -> Path:
    pulsars = {
        p["jname"]: p
        for p in json.loads((DATA_PROCESSED / "pulsars.json").read_text(encoding="utf-8"))
    }
    profiles = {
        p.stem: json.loads(p.read_text(encoding="utf-8"))
        for p in sorted(PHONOLOGY_DIR.glob("*.json"))
    }

    labels = sorted(profiles.keys())
    feats = np.array([
        _feature_vector(profiles[j], pulsars.get(j, {}).get("dm", 1.0))
        for j in labels
    ])

    # z-normalise so features contribute equally
    std = feats.std(axis=0)
    std[std == 0] = 1.0
    feats_n = (feats - feats.mean(axis=0)) / std

    dists = pdist(feats_n, metric="euclidean")
    Z = linkage(dists, method="ward")
    root, _ = to_tree(Z, rd=True)

    d3_tree = _scipy_to_d3(root, labels)
    JSON_PATH.write_text(json.dumps(d3_tree, indent=2, ensure_ascii=False), encoding="utf-8")

    newick = _scipy_to_newick(root, labels, root.dist) + ";"
    NEWICK_PATH.write_text(newick, encoding="utf-8")

    log.info("tree: %d leaves → %s + %s", len(labels), JSON_PATH, NEWICK_PATH)
    return JSON_PATH


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
