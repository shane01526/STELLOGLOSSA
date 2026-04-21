"""Module 4 輔助: Voyage AI voyage-3 embeddings wrapper.

無 API key 時,以確定性的 hash-based 偽向量替代,讓下游可跑通。
"""
from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Any

import numpy as np

from config import DATA_PROCESSED, LEXICON_DIR, OUTPUT_DIR, VOYAGE_API_KEY, VOYAGE_CONFIG

log = logging.getLogger(__name__)

_CACHE_PATH = OUTPUT_DIR / "embeddings.npz"


def _fake_embed(text: str, dim: int) -> np.ndarray:
    """Deterministic pseudo-embedding — hash-expanded and L2-normalised."""
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    rng = np.random.default_rng(int.from_bytes(digest[:8], "big"))
    vec = rng.standard_normal(dim).astype(np.float32)
    return vec / (np.linalg.norm(vec) + 1e-9)


def embed_texts(texts: list[str]) -> np.ndarray:
    dim = VOYAGE_CONFIG["dimension"]
    if not VOYAGE_API_KEY:
        log.warning("VOYAGE_API_KEY missing — using deterministic fallback embeddings.")
        return np.vstack([_fake_embed(t, dim) for t in texts])

    import voyageai

    vo = voyageai.Client(api_key=VOYAGE_API_KEY)
    # Voyage 的 batch 限制約 128 條,這裡以 64 保守切分
    chunks = [texts[i : i + 64] for i in range(0, len(texts), 64)]
    out = []
    for chunk in chunks:
        resp = vo.embed(chunk, model=VOYAGE_CONFIG["model"], input_type="document")
        out.extend(resp.embeddings)
    return np.asarray(out, dtype=np.float32)


def collect_word_texts() -> tuple[list[dict[str, Any]], list[str]]:
    """Flatten all lexicons → list of records + matching list of gloss texts."""
    records, texts = [], []
    for path in sorted(LEXICON_DIR.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        jname = payload["jname"]
        for field, entries in payload["lexicon"].items():
            for entry in entries:
                records.append({
                    "jname": jname,
                    "field": field,
                    "form": entry.get("form", ""),
                    "gloss": entry.get("gloss", ""),
                })
                texts.append(f"{field}: {entry.get('gloss', '')}")
    return records, texts


def run() -> Path:
    records, texts = collect_word_texts()
    if not texts:
        raise RuntimeError("No lexicon entries found. Run lexicon stage first.")
    vectors = embed_texts(texts)
    np.savez_compressed(
        _CACHE_PATH,
        vectors=vectors,
        records=np.array(json.dumps(records, ensure_ascii=False)),
    )
    log.info("embedded %d words → %s", len(records), _CACHE_PATH)
    return _CACHE_PATH


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
