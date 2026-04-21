"""全域設定: API、路徑、物理映射閾值。"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).parent.resolve()
DATA_RAW = ROOT / "data" / "raw"
DATA_PROCESSED = ROOT / "data" / "processed"
PHONOLOGY_DIR = DATA_PROCESSED / "phonology_profiles"
LEXICON_DIR = DATA_PROCESSED / "lexicons"
OUTPUT_DIR = ROOT / "output"

for d in (DATA_RAW, DATA_PROCESSED, PHONOLOGY_DIR, LEXICON_DIR, OUTPUT_DIR):
    d.mkdir(parents=True, exist_ok=True)

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
VOYAGE_API_KEY = os.getenv("VOYAGE_API_KEY", "")

# 詞彙生成使用的 LLM provider: "anthropic" | "openai" | "gemini"
# 可由 .env 的 LLM_PROVIDER 或 pipeline.py --provider 覆寫。
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "anthropic").lower()

LLM_CONFIGS = {
    "anthropic": {
        "model": "claude-sonnet-4-6",
        "max_tokens": 2000,
    },
    "openai": {
        "model": "gpt-4o",
        "max_tokens": 2000,
    },
    "gemini": {
        "model": "gemini-2.5-flash",
        "max_tokens": 2000,
    },
}

VOYAGE_CONFIG = {
    "model": "voyage-3",
    "dimension": 1024,
}

SAMPLE_SIZE = 50
WORDS_PER_FIELD = 20
CONTACT_LAMBDA_KPC = 1.0

# ── Audio synthesis (MBROLA + ffmpeg) ──────────────────────────────────────
# Tools live under the user's tools dir; set to None or a different path if
# you installed them elsewhere.
_TOOLS = Path.home() / "tools"
MBROLA_EXE = _TOOLS / "mbrola" / "mbrola.exe"
MBROLA_VOICES_DIR = _TOOLS / "mbrola" / "voices"   # expects voices/<name>/<name>
FFMPEG_EXE = _TOOLS / "ffmpeg" / "bin" / "ffmpeg.exe"

# Physics → speech parameter envelopes. Tweak to change the "voice personality".
AUDIO_CONFIG = {
    # Speed envelope: log10(period_s) ∈ [-3, 0.7] → wpm range
    "speed_wpm": {"fast": 260, "slow": 130},   # short P → fast speech
    # Base pitch (Hz). Short P → high pitch.
    "pitch_hz": {"high": 220, "low": 80},
    # Per-syllable pitch sag (Hz) for natural intonation.
    "pitch_sag_hz": 15,
    # Tone count multiplies the pitch variation within a word.
    "tone_pitch_spread_hz": 25,  # per tone step
    # Vowel duration (ms) envelope: log10(w50_ms) → ms
    "vowel_dur_ms": {"short": 120, "long": 220},
    # Consonant duration (ms) — roughly constant.
    "cons_dur_ms": {"stop": 65, "fric": 90, "nasal": 75, "liquid": 60, "other": 70},
    # ffmpeg reverb envelopes (aecho parameters).
    "reverb_decay": {"min": 0.30, "max": 0.85},    # driven by DM
    "reverb_delay_ms": {"min": 30, "max": 120},    # driven by distance
    "reverb_in_gain": 0.85,                         # aecho's "in" gain
    # Lowpass/highpass cutoffs to tame the formant synth grit
    "highpass_hz": 80,
    "lowpass_hz": 7200,
}

SYLLABLE_THRESHOLDS_S = [0.01, 0.1, 1.0]
SYLLABLE_STRUCTURES = ["CV", "CVC", "CCVC", "CCCVCC"]

DM_THRESHOLDS = [10, 50, 200]
TONE_COUNTS = [0, 2, 4, 6]

PDOT_THRESHOLDS = [1e-19, 1e-17, 1e-15]
TENSE_RICHNESS = ["none", "past-nonpast", "past-present-future", "compound"]

W50_THRESHOLDS_MS = [1, 5, 20]
VOWEL_INVENTORIES = [
    ["a", "i", "u"],
    ["a", "e", "i", "o", "u"],
    ["a", "e", "i", "o", "u", "ɛ", "ɔ"],
    ["a", "e", "i", "o", "u", "ɛ", "ɔ", "y", "ø", "ã"],
]

# ── Consonant inventory (子音庫) ─────────────────────────────────────────────
# 規則 1:庫大小由音節結構決定 — 結構越複雜,C 位置越多,需要更多對比。
CONSONANT_COUNT_BY_SYLLABLE = {"CV": 6, "CVC": 9, "CCVC": 12, "CCCVCC": 15}

# 規則 2:庫的「風味」由聲調數決定 — 無聲調的語言靠音段對比,擦音多;
# 聲調豐富的語言音段可以單純,塞音為主。
# 每個風味是一個有序的優先級列表;實際取前 N 個。
CONSONANT_POOL_BY_TONE = {
    # 0 聲調 → 擦音豐富,對比靠音段自身
    0: ["s", "t", "m", "n", "k", "ʃ", "h", "l", "f", "p", "r", "v", "z", "j", "w"],
    # 2 聲調 → 介於兩者之間
    2: ["t", "k", "m", "n", "s", "p", "l", "r", "b", "ʃ", "h", "d", "g", "j", "w"],
    # 4 聲調 → 以塞音為主,擦音少
    4: ["t", "k", "p", "m", "n", "l", "b", "d", "g", "s", "ŋ", "r", "h", "j", "w"],
    # 6+ 聲調 → 幾乎全塞音 + 多彈舌音
    6: ["t", "k", "p", "b", "d", "g", "m", "n", "ŋ", "l", "ɾ", "r", "s", "j", "w"],
}

SEMANTIC_FIELDS = [
    "celestial", "time", "death", "light", "return",
    "distance", "density", "direction", "contact", "myth",
    "pronoun", "function",
]
