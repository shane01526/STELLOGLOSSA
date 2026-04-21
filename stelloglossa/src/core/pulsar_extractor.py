"""Module 1: ATNF Pulsar Catalogue 擷取 → pulsars.json

優先用 psrqpy 從真實 ATNF 資料庫抓取 (2000+ 顆脈衝星)。
若 psrqpy 不可用或下載失敗,fallback 到離線 seed 清單。
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from config import DATA_PROCESSED, DATA_RAW, SAMPLE_SIZE
from src.core.constellation_mapper import (
    equatorial_to_galactic_cartesian,
    ra_dec_to_constellation,
)

log = logging.getLogger(__name__)

ATNF_PARAMS = ["JNAME", "RAJ", "DECJ", "P0", "DM", "P1", "W50", "DIST"]
ATNF_CONDITION = "P0 < 5 && DM > 0 && W50 > 0 && P1 > 0"
ATNF_CACHE = DATA_RAW / "atnf_cache.json"


def fetch_from_atnf() -> list[dict[str, Any]] | None:
    """Query live ATNF Pulsar Catalogue via psrqpy. Cache to disk."""
    if ATNF_CACHE.exists():
        log.info("using cached ATNF data: %s", ATNF_CACHE)
        return json.loads(ATNF_CACHE.read_text(encoding="utf-8"))
    try:
        import psrqpy
    except ImportError:
        log.warning("psrqpy not installed — fallback to seed.")
        return None
    try:
        q = psrqpy.QueryATNF(params=ATNF_PARAMS, condition=ATNF_CONDITION, checkupdate=False)
        table = q.table
    except Exception as exc:  # noqa: BLE001
        log.warning("ATNF live query failed: %s — fallback to seed.", exc)
        return None

    records = []
    for row in table:
        records.append({
            "jname": str(row["JNAME"]),
            "raj": str(row["RAJ"]),
            "decj": str(row["DECJ"]),
            "p0": float(row["P0"]),
            "dm": float(row["DM"]),
            "p1": float(row["P1"]),
            "w50": float(row["W50"]),
            "dist": float(row["DIST"]) if row["DIST"] not in (None, "") and not _isnan(row["DIST"]) else 1.0,
        })
    ATNF_CACHE.parent.mkdir(parents=True, exist_ok=True)
    ATNF_CACHE.write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")
    log.info("fetched %d pulsars from ATNF live → %s", len(records), ATNF_CACHE)
    return records


def _isnan(v: Any) -> bool:
    try:
        import math
        return math.isnan(float(v))
    except (TypeError, ValueError):
        return False


def load_seed() -> list[dict[str, Any]]:
    seed_path = DATA_RAW / "seed_pulsars.json"
    if not seed_path.exists():
        _write_default_seed(seed_path)
    return json.loads(seed_path.read_text(encoding="utf-8"))


def _write_default_seed(path: Path) -> None:
    """A small representative sample across parameter space, for offline runs."""
    seed = [
        {"jname": "J0437-4715", "raj": "04:37:15.8", "decj": "-47:15:09", "p0": 0.005757, "dm": 2.64, "p1": 5.73e-20, "w50": 0.14, "dist": 0.157},
        {"jname": "J0437-4715b", "raj": "04:37:16.0", "decj": "-47:15:10", "p0": 0.008, "dm": 5.0, "p1": 2.0e-20, "w50": 0.2, "dist": 0.20},
        {"jname": "J0534+2200", "raj": "05:34:31.9", "decj": "+22:00:52", "p0": 0.0333, "dm": 56.77, "p1": 4.21e-13, "w50": 3.0, "dist": 2.0},
        {"jname": "J0613-0200", "raj": "06:13:43.9", "decj": "-02:00:47", "p0": 0.003062, "dm": 38.78, "p1": 8.98e-21, "w50": 0.11, "dist": 1.0},
        {"jname": "J0630-2834", "raj": "06:30:49.4", "decj": "-28:34:42", "p0": 1.244, "dm": 34.43, "p1": 7.12e-15, "w50": 30.0, "dist": 0.33},
        {"jname": "J0742-2822", "raj": "07:42:49.0", "decj": "-28:22:43", "p0": 0.1668, "dm": 73.78, "p1": 1.68e-14, "w50": 8.5, "dist": 2.07},
        {"jname": "J0835-4510", "raj": "08:35:20.6", "decj": "-45:10:34", "p0": 0.0893, "dm": 67.77, "p1": 1.25e-13, "w50": 1.9, "dist": 0.28},
        {"jname": "J0953+0755", "raj": "09:53:09.3", "decj": "+07:55:35", "p0": 0.2531, "dm": 2.97, "p1": 2.30e-16, "w50": 9.5, "dist": 0.26},
        {"jname": "J1022+1001", "raj": "10:22:58.0", "decj": "+10:01:52", "p0": 0.016453, "dm": 10.25, "p1": 4.33e-20, "w50": 0.5, "dist": 0.83},
        {"jname": "J1231-1411", "raj": "12:31:11.3", "decj": "-14:11:43", "p0": 0.003684, "dm": 8.09, "p1": 2.28e-20, "w50": 0.08, "dist": 0.42},
        {"jname": "J1400-1431", "raj": "14:00:00.0", "decj": "-14:31:00", "p0": 0.003084, "dm": 4.93, "p1": 7.8e-21, "w50": 0.12, "dist": 0.27},
        {"jname": "J1456-6843", "raj": "14:56:00.0", "decj": "-68:43:39", "p0": 0.263, "dm": 8.6, "p1": 9.85e-17, "w50": 25.0, "dist": 0.45},
        {"jname": "J1509+5531", "raj": "15:09:25.6", "decj": "+55:31:32", "p0": 0.739, "dm": 19.62, "p1": 5.15e-15, "w50": 55.0, "dist": 2.12},
        {"jname": "J1600-3053", "raj": "16:00:51.9", "decj": "-30:53:49", "p0": 0.00359, "dm": 52.33, "p1": 9.5e-21, "w50": 0.15, "dist": 2.53},
        {"jname": "J1614-2230", "raj": "16:14:36.5", "decj": "-22:30:31", "p0": 0.003151, "dm": 34.49, "p1": 9.62e-21, "w50": 0.14, "dist": 0.70},
        {"jname": "J1643-1224", "raj": "16:43:38.2", "decj": "-12:24:58", "p0": 0.004622, "dm": 62.41, "p1": 1.85e-20, "w50": 0.32, "dist": 0.74},
        {"jname": "J1713+0747", "raj": "17:13:49.5", "decj": "+07:47:37", "p0": 0.004570, "dm": 15.92, "p1": 8.52e-21, "w50": 0.10, "dist": 1.22},
        {"jname": "J1744-1134", "raj": "17:44:29.4", "decj": "-11:34:54", "p0": 0.004075, "dm": 3.14, "p1": 8.96e-21, "w50": 0.14, "dist": 0.42},
        {"jname": "J1824-2452A", "raj": "18:24:32.0", "decj": "-24:52:11", "p0": 0.003054, "dm": 119.89, "p1": 1.62e-18, "w50": 0.15, "dist": 5.5},
        {"jname": "J1857+0943", "raj": "18:57:36.4", "decj": "+09:43:17", "p0": 0.005362, "dm": 13.30, "p1": 1.78e-20, "w50": 0.13, "dist": 0.77},
        {"jname": "J1909-3744", "raj": "19:09:47.4", "decj": "-37:44:14", "p0": 0.002947, "dm": 10.39, "p1": 1.40e-21, "w50": 0.05, "dist": 1.14},
        {"jname": "J1918-0642", "raj": "19:18:48.0", "decj": "-06:42:55", "p0": 0.007646, "dm": 26.55, "p1": 2.57e-20, "w50": 0.32, "dist": 1.40},
        {"jname": "J1939+2134", "raj": "19:39:38.6", "decj": "+21:34:59", "p0": 0.00156, "dm": 71.04, "p1": 1.05e-19, "w50": 0.03, "dist": 3.5},
        {"jname": "J1952+3252", "raj": "19:52:58.0", "decj": "+32:52:41", "p0": 0.039531, "dm": 29.01, "p1": 5.84e-15, "w50": 1.6, "dist": 3.0},
        {"jname": "J2051-0827", "raj": "20:51:07.5", "decj": "-08:27:38", "p0": 0.004509, "dm": 20.73, "p1": 1.27e-20, "w50": 0.08, "dist": 1.04},
        {"jname": "J2124-3358", "raj": "21:24:43.8", "decj": "-33:58:45", "p0": 0.004931, "dm": 4.60, "p1": 2.06e-20, "w50": 0.26, "dist": 0.41},
        {"jname": "J2145-0750", "raj": "21:45:50.5", "decj": "-07:50:18", "p0": 0.016052, "dm": 9.00, "p1": 2.98e-20, "w50": 0.38, "dist": 0.62},
        {"jname": "J2222-0137", "raj": "22:22:05.9", "decj": "-01:37:15", "p0": 0.032818, "dm": 3.28, "p1": 5.82e-20, "w50": 1.4, "dist": 0.27},
        {"jname": "J2317+1439", "raj": "23:17:09.2", "decj": "+14:39:31", "p0": 0.003445, "dm": 21.90, "p1": 2.43e-21, "w50": 0.13, "dist": 2.16},
        {"jname": "J0108-1431", "raj": "01:08:08.3", "decj": "-14:31:50", "p0": 0.8076, "dm": 2.38, "p1": 7.71e-17, "w50": 40.0, "dist": 0.21},
        {"jname": "J0151-0635", "raj": "01:51:22.7", "decj": "-06:35:02", "p0": 1.464, "dm": 25.66, "p1": 4.23e-15, "w50": 50.0, "dist": 1.0},
        {"jname": "J0332+5434", "raj": "03:32:59.4", "decj": "+54:34:43", "p0": 0.7145, "dm": 26.78, "p1": 2.01e-15, "w50": 35.0, "dist": 1.0},
        {"jname": "J0358+5413", "raj": "03:58:53.7", "decj": "+54:13:13", "p0": 0.1564, "dm": 57.14, "p1": 4.40e-15, "w50": 5.2, "dist": 1.0},
        {"jname": "J0454+5543", "raj": "04:54:07.7", "decj": "+55:43:41", "p0": 0.3408, "dm": 14.59, "p1": 2.37e-15, "w50": 20.0, "dist": 1.18},
        {"jname": "J0614+2229", "raj": "06:14:17.0", "decj": "+22:29:56", "p0": 0.3349, "dm": 96.91, "p1": 5.92e-15, "w50": 18.0, "dist": 3.0},
        {"jname": "J0659+1414", "raj": "06:59:48.1", "decj": "+14:14:21", "p0": 0.3849, "dm": 13.98, "p1": 5.50e-14, "w50": 23.0, "dist": 0.29},
        {"jname": "J0814+7429", "raj": "08:14:59.5", "decj": "+74:29:05", "p0": 1.2922, "dm": 5.75, "p1": 1.68e-16, "w50": 60.0, "dist": 0.43},
        {"jname": "J0820-1350", "raj": "08:20:26.4", "decj": "-13:50:55", "p0": 1.2381, "dm": 40.94, "p1": 2.13e-15, "w50": 45.0, "dist": 1.96},
        {"jname": "J0826+2637", "raj": "08:26:51.4", "decj": "+26:37:23", "p0": 0.5307, "dm": 19.48, "p1": 1.71e-15, "w50": 22.0, "dist": 0.36},
        {"jname": "J0922+0638", "raj": "09:22:14.0", "decj": "+06:38:23", "p0": 0.4306, "dm": 27.29, "p1": 1.36e-14, "w50": 17.0, "dist": 1.0},
        {"jname": "J1136+1551", "raj": "11:36:03.2", "decj": "+15:51:04", "p0": 1.1879, "dm": 4.86, "p1": 3.73e-15, "w50": 47.0, "dist": 0.35},
        {"jname": "J1239+2453", "raj": "12:39:40.4", "decj": "+24:53:50", "p0": 1.3824, "dm": 9.25, "p1": 9.55e-16, "w50": 55.0, "dist": 0.85},
        {"jname": "J1645-0317", "raj": "16:45:02.0", "decj": "-03:17:58", "p0": 0.3876, "dm": 35.76, "p1": 1.78e-15, "w50": 19.0, "dist": 2.91},
        {"jname": "J1752-2806", "raj": "17:52:58.7", "decj": "-28:06:37", "p0": 0.5626, "dm": 50.37, "p1": 8.14e-15, "w50": 24.0, "dist": 0.2},
        {"jname": "J1932+1059", "raj": "19:32:13.9", "decj": "+10:59:32", "p0": 0.2265, "dm": 3.18, "p1": 1.16e-15, "w50": 8.0, "dist": 0.36},
        {"jname": "J2018+2839", "raj": "20:18:03.8", "decj": "+28:39:54", "p0": 0.5579, "dm": 14.18, "p1": 1.43e-16, "w50": 26.0, "dist": 0.95},
        {"jname": "J2048-1616", "raj": "20:48:35.6", "decj": "-16:16:44", "p0": 1.9619, "dm": 11.46, "p1": 1.09e-14, "w50": 75.0, "dist": 0.64},
        {"jname": "J2113+4644", "raj": "21:13:24.3", "decj": "+46:44:09", "p0": 1.0145, "dm": 141.26, "p1": 7.18e-16, "w50": 43.0, "dist": 3.0},
        {"jname": "J2305+3100", "raj": "23:05:58.3", "decj": "+31:00:01", "p0": 1.5759, "dm": 49.58, "p1": 3.86e-15, "w50": 62.0, "dist": 1.89},
        {"jname": "J2313+4253", "raj": "23:13:08.6", "decj": "+42:53:13", "p0": 0.3493, "dm": 17.28, "p1": 1.14e-16, "w50": 16.0, "dist": 1.05},
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(seed, indent=2, ensure_ascii=False), encoding="utf-8")
    log.info("Wrote default seed data (%d pulsars) to %s", len(seed), path)


def enrich(record: dict[str, Any]) -> dict[str, Any]:
    """Add constellation + galactic cartesian. Safe on malformed coords."""
    try:
        constellation = ra_dec_to_constellation(record["raj"], record["decj"])
    except Exception:
        constellation = "Unknown"
    try:
        gx, gy, gz = equatorial_to_galactic_cartesian(
            record["raj"], record["decj"], float(record.get("dist") or 1.0)
        )
    except Exception:
        gx = gy = gz = 0.0
    return {
        "jname": record["jname"],
        "ra": record["raj"],
        "dec": record["decj"],
        "period_s": float(record["p0"]),
        "dm": float(record["dm"]),
        "period_dot": float(record["p1"]),
        "w50_ms": float(record["w50"]),
        "distance_kpc": float(record.get("dist") or 1.0),
        "constellation": constellation,
        "galactic_xyz_kpc": [gx, gy, gz],
    }


def filter_sample(records: list[dict[str, Any]], n: int = SAMPLE_SIZE) -> list[dict[str, Any]]:
    """Stratified sample: diverse across period (4 bins) × DM (4 bins) × RA (4 bins).

    Ensures good coverage of parameter space and the sky rather than
    clumping in one constellation.
    """
    import random

    def _ra_hours(raj: str) -> float:
        parts = raj.split(":")
        h, m, s = (float(parts[i]) if i < len(parts) else 0.0 for i in range(3))
        return h + m / 60 + s / 3600

    passing = [
        r for r in records
        if float(r.get("p0", 0)) < 5.0 and r.get("dm") and r.get("w50")
    ]
    if len(passing) <= n:
        return passing

    # 3-D bins: period log-bin × DM log-bin × RA quadrant
    rng = random.Random(42)  # deterministic sampling
    buckets: dict[tuple[int, int, int], list[dict[str, Any]]] = {}
    for r in passing:
        p_bin = min(int((1 + (0 if r["p0"] <= 0 else __import__("math").log10(r["p0"]) + 3) // 1.5)), 3)
        d_bin = min(int(__import__("math").log10(max(r["dm"], 1))), 3)
        ra_bin = int(_ra_hours(r["raj"]) // 6)  # 0..3 (4 quadrants)
        buckets.setdefault((p_bin, d_bin, ra_bin), []).append(r)

    # Round-robin pick one from each bucket until we have n
    bucket_lists = [rng.sample(v, len(v)) for v in buckets.values()]
    picked: list[dict[str, Any]] = []
    i = 0
    while len(picked) < n:
        progress = False
        for bl in bucket_lists:
            if i < len(bl):
                picked.append(bl[i])
                progress = True
                if len(picked) >= n:
                    break
        if not progress:
            break
        i += 1
    return picked[:n]


def run(output: Path | None = None) -> list[dict[str, Any]]:
    raw = fetch_from_atnf() or load_seed()
    sample = filter_sample(raw)
    enriched = [enrich(r) for r in sample]
    out_path = output or (DATA_PROCESSED / "pulsars.json")
    out_path.write_text(json.dumps(enriched, indent=2, ensure_ascii=False), encoding="utf-8")
    log.info("Wrote %d pulsars to %s", len(enriched), out_path)
    return enriched


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
