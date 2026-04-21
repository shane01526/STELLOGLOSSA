from src.core.phonology_engine import build_profile
from src.core.phonology_validator import validate_word


def _pulsar(**overrides):
    base = {
        "jname": "JTEST",
        "period_s": 0.005,
        "dm": 5,
        "period_dot": 1e-20,
        "w50_ms": 0.5,
        "constellation": "Test",
    }
    base.update(overrides)
    return base


def test_millisecond_pulsar_gets_simple_profile():
    p = build_profile(_pulsar())
    assert p["syllable_structure"] == "CV"
    assert p["tone_count"] == 0
    assert p["vowel_inventory"] == ["a", "i", "u"]


def test_high_dm_gets_more_tones():
    p = build_profile(_pulsar(dm=300))
    assert p["tone_count"] >= 6


def test_slow_pulsar_complex_syllables():
    p = build_profile(_pulsar(period_s=2.5))
    assert p["syllable_structure"] == "CCCVCC"


def test_wide_pulse_more_vowels():
    p = build_profile(_pulsar(w50_ms=30))
    assert len(p["vowel_inventory"]) >= 10


def test_validator_accepts_matching_syllable():
    assert validate_word("tata", "CV", ["a", "i", "u"])
    assert validate_word("tiku", "CV", ["a", "i", "u"])


def test_validator_rejects_non_inventory_vowel():
    assert not validate_word("teta", "CV", ["a", "i", "u"])


def test_validator_rejects_wrong_structure():
    assert not validate_word("ta", "CVC", ["a", "i", "u"])


def test_consonant_count_scales_with_syllable():
    simple = build_profile(_pulsar(period_s=0.005))      # CV
    medium = build_profile(_pulsar(period_s=0.05))       # CVC
    complex_ = build_profile(_pulsar(period_s=0.5))      # CCVC
    extreme = build_profile(_pulsar(period_s=2.5))       # CCCVCC
    assert len(simple["consonant_inventory"]) < len(medium["consonant_inventory"])
    assert len(medium["consonant_inventory"]) < len(complex_["consonant_inventory"])
    assert len(complex_["consonant_inventory"]) < len(extreme["consonant_inventory"])


def test_tonal_languages_prefer_plosives():
    atonal = build_profile(_pulsar(period_s=0.005, dm=5))     # 0 聲調
    tonal = build_profile(_pulsar(period_s=0.005, dm=500))    # 6+ 聲調
    # Fricatives (s/ʃ/f/h/v/z) should be a larger share in atonal languages
    FRIC = {"s", "ʃ", "f", "h", "v", "z"}
    atonal_fric = sum(1 for c in atonal["consonant_inventory"] if c in FRIC)
    tonal_fric = sum(1 for c in tonal["consonant_inventory"] if c in FRIC)
    assert atonal_fric > tonal_fric
