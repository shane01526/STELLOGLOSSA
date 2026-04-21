"""把 data/ 與 output/ 匯成單一 frontend_bundle.json,供前端一次載入。"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import networkx as nx

from config import DATA_PROCESSED, OUTPUT_DIR, PHONOLOGY_DIR

log = logging.getLogger(__name__)

BUNDLE_PATH = Path(__file__).parent / "public" / "data" / "bundle.json"


def build() -> dict:
    from config import LEXICON_DIR

    pulsars = json.loads((DATA_PROCESSED / "pulsars.json").read_text(encoding="utf-8"))
    profiles = {
        p.stem: json.loads(p.read_text(encoding="utf-8"))
        for p in PHONOLOGY_DIR.glob("*.json")
    }
    lexicons = {
        p.stem: json.loads(p.read_text(encoding="utf-8"))
        for p in LEXICON_DIR.glob("*.json")
    }

    graph_path = OUTPUT_DIR / "contact_graph.graphml"
    graph_data = {"nodes": [], "links": []}
    if graph_path.exists():
        G = nx.read_graphml(graph_path)
        graph_data = nx.node_link_data(G, edges="links")

    manifest_path = OUTPUT_DIR / "audio_manifest.json"
    audio_manifest = (
        json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest_path.exists() else []
    )

    hypo_path = OUTPUT_DIR / "hypothesis_results.json"
    hypotheses = (
        json.loads(hypo_path.read_text(encoding="utf-8"))
        if hypo_path.exists() else {}
    )

    tree_path = OUTPUT_DIR / "language_tree.json"
    tree = (
        json.loads(tree_path.read_text(encoding="utf-8"))
        if tree_path.exists() else None
    )

    drift_path = OUTPUT_DIR / "drift_summary.json"
    drift = (
        json.loads(drift_path.read_text(encoding="utf-8"))
        if drift_path.exists() else None
    )

    poems_dir = OUTPUT_DIR / "poems"
    poems = {
        p.stem: json.loads(p.read_text(encoding="utf-8"))
        for p in poems_dir.glob("*.json")
    } if poems_dir.exists() else {}

    letters_dir = OUTPUT_DIR / "letters"
    letters = {
        p.stem: json.loads(p.read_text(encoding="utf-8"))
        for p in letters_dir.glob("*.json")
    } if letters_dir.exists() else {}

    return {
        "pulsars": pulsars,
        "profiles": profiles,
        "lexicons": lexicons,
        "graph": graph_data,
        "audio_manifest": audio_manifest,
        "hypotheses": hypotheses,
        "tree": tree,
        "drift": drift,
        "poems": poems,
        "letters": letters,
    }


def run() -> Path:
    BUNDLE_PATH.parent.mkdir(parents=True, exist_ok=True)
    bundle = build()
    BUNDLE_PATH.write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
    log.info(
        "bundle: %d pulsars, %d profiles, %d lexicons, %d edges → %s",
        len(bundle["pulsars"]),
        len(bundle["profiles"]),
        len(bundle["lexicons"]),
        len(bundle["graph"].get("links", [])),
        BUNDLE_PATH,
    )
    return BUNDLE_PATH


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
