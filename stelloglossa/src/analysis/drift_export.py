"""把 drift_snapshots.npy (steps × 2500 × 1024) 壓縮成前端可用的摘要。

輸出 drift_summary.json:
  {
    "steps": 6,
    "fields": [...],
    "drift": {
      "<jname>": {
        "<field>": [0.0, 0.08, 0.14, 0.17, 0.18, 0.18]   # L2 dist from initial, per step
      }
    }
  }

每個數字 ∈ [0, ~2],數字越大代表該概念在該星已被鄰星改變越多。
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np

from config import OUTPUT_DIR, SEMANTIC_FIELDS

log = logging.getLogger(__name__)

OUT_PATH = OUTPUT_DIR / "drift_summary.json"


def run() -> Path:
    emb_path = OUTPUT_DIR / "embeddings.npz"
    snap_path = OUTPUT_DIR / "drift_snapshots.npy"
    if not snap_path.exists() or not emb_path.exists():
        raise RuntimeError("run embed + drift stages first")

    data = np.load(emb_path, allow_pickle=True)
    records = json.loads(str(data["records"]))

    snapshots = np.load(snap_path)  # (steps+1, n, dim)
    n_steps = snapshots.shape[0]

    initial = snapshots[0]
    drift_per_step = np.linalg.norm(snapshots - initial, axis=2)  # (steps+1, n)

    summary: dict[str, dict[str, list[float]]] = {}
    for idx, rec in enumerate(records):
        jname = rec["jname"]
        field = rec["field"]
        per_step = [float(drift_per_step[s, idx]) for s in range(n_steps)]
        bucket = summary.setdefault(jname, {})
        # Multiple entries per (jname, field) — 5 words; take mean
        if field not in bucket:
            bucket[field] = per_step
        else:
            existing = bucket[field]
            bucket[field] = [(a + b) / 2 for a, b in zip(existing, per_step)]

    output = {
        "steps": n_steps,
        "fields": list(SEMANTIC_FIELDS),
        "max_drift": float(drift_per_step.max()),
        "drift": summary,
    }
    OUT_PATH.write_text(json.dumps(output, ensure_ascii=False), encoding="utf-8")
    log.info(
        "drift summary: %d pulsars × %d fields × %d steps → %s",
        len(summary), len(SEMANTIC_FIELDS), n_steps, OUT_PATH,
    )
    return OUT_PATH


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
