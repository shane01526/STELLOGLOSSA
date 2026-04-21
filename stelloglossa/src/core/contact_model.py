"""Module 4: 脈衝星語言接觸網絡。

距離以 astropy 轉出的銀河笛卡爾座標計算歐幾里得距離（kpc）。
"""
from __future__ import annotations

import json
import logging
import math
from pathlib import Path
from typing import Any, Iterable

import networkx as nx

from config import CONTACT_LAMBDA_KPC, DATA_PROCESSED, OUTPUT_DIR

log = logging.getLogger(__name__)


def stellar_distance(a: dict[str, Any], b: dict[str, Any]) -> float:
    ax, ay, az = a.get("galactic_xyz_kpc", [0.0, 0.0, 0.0])
    bx, by, bz = b.get("galactic_xyz_kpc", [0.0, 0.0, 0.0])
    return math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2)


def contact_weight(distance_kpc: float, lam: float = CONTACT_LAMBDA_KPC) -> float:
    return math.exp(-distance_kpc / lam)


def contact_regime(distance_kpc: float) -> str:
    if distance_kpc < 0.5:
        return "borrowing"
    if distance_kpc < 2.0:
        return "extension"
    if distance_kpc < 5.0:
        return "narrowing"
    return "isolation"


def build_graph(
    pulsars: Iterable[dict[str, Any]], distance_cutoff_kpc: float = 5.0
) -> nx.Graph:
    G = nx.Graph()
    pulsars = list(pulsars)
    for p in pulsars:
        pos = p.get("galactic_xyz_kpc") or [0.0, 0.0, 0.0]
        G.add_node(
            str(p["jname"]),
            constellation=str(p.get("constellation", "")),
            dm=float(p.get("dm") or 0.0),
            period_s=float(p.get("period_s") or 0.0),
            gx=float(pos[0]),
            gy=float(pos[1]),
            gz=float(pos[2]),
        )
    for i, a in enumerate(pulsars):
        for b in pulsars[i + 1 :]:
            d = stellar_distance(a, b)
            if d > distance_cutoff_kpc:
                continue
            G.add_edge(
                a["jname"], b["jname"],
                distance_kpc=d,
                weight=contact_weight(d),
                regime=contact_regime(d),
            )
    log.info("contact graph: %d nodes, %d edges", G.number_of_nodes(), G.number_of_edges())
    return G


def run(pulsars: list[dict[str, Any]] | None = None, output: Path | None = None) -> nx.Graph:
    if pulsars is None:
        pulsars = json.loads((DATA_PROCESSED / "pulsars.json").read_text(encoding="utf-8"))
    G = build_graph(pulsars)
    out_path = output or (OUTPUT_DIR / "contact_graph.graphml")
    nx.write_graphml(G, out_path)
    json_path = out_path.with_suffix(".json")
    json_path.write_text(json.dumps(nx.node_link_data(G, edges="links"), indent=2, ensure_ascii=False), encoding="utf-8")
    log.info("wrote %s + %s", out_path, json_path)
    return G


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
