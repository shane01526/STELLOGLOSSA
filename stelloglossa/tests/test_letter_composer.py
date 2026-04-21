from src.api.letter_composer import _synthetic_letter


def _sample(**over):
    profile = {
        "jname": "JTEST", "constellation": "Test",
        "syllable_structure": "CV", "tone_count": 0, "tense_richness": "none",
        "vowel_inventory": ["a", "i", "u"],
    }
    lexicon = {"lexicon": {
        "celestial": [{"form": "ta", "gloss": "star"}],
        "light": [{"form": "la", "gloss": "light"}],
        "death": [{"form": "ka", "gloss": "death"}],
        "return": [{"form": "ra", "gloss": "return"}],
        "time": [{"form": "ma", "gloss": "time"}],
    }}
    pulsar = {
        "jname": "JTEST", "constellation": "Test",
        "period_s": 0.005, "dm": 10, "period_dot": 1e-20,
        "w50_ms": 0.5, "distance_kpc": 1.0,
    }
    pulsar.update(over)
    return profile, lexicon, pulsar


def test_synthetic_letter_has_required_shape():
    profile, lexicon, pulsar = _sample()
    letter = _synthetic_letter(profile, lexicon, pulsar, [])
    assert letter["greeting"]
    assert isinstance(letter["body"], list) and len(letter["body"]) >= 4
    assert letter["signoff"]
    assert letter["subtitle"] and len(letter["subtitle"]) > 5
    for k in ("period", "dm", "pdot", "w50"):
        assert letter["derivations"][k]


def test_synthetic_letter_is_deterministic_per_jname():
    profile, lexicon, pulsar = _sample()
    a = _synthetic_letter(profile, lexicon, pulsar, [])
    b = _synthetic_letter(profile, lexicon, pulsar, [])
    assert a["subtitle"] == b["subtitle"]
    assert a["derivations"] == b["derivations"]
    assert a["body"] == b["body"]


def test_synthetic_letter_differs_between_jnames():
    profile_a, lexicon_a, pulsar_a = _sample(jname="J0001+0001")
    profile_b, lexicon_b, pulsar_b = _sample(jname="J9999-9999")
    la = _synthetic_letter(profile_a, lexicon_a, pulsar_a, [])
    lb = _synthetic_letter(profile_b, lexicon_b, pulsar_b, [])
    # With same physics but different jname, subtitle or greeting should differ
    assert (la["subtitle"] != lb["subtitle"]
            or la["greeting"] != lb["greeting"]
            or la["body"] != lb["body"])


def test_synthetic_letter_includes_neighbour_when_present():
    profile, lexicon, pulsar = _sample()
    neigh = [{"jname": "JNEIGH", "distance_kpc": 0.5, "regime": "borrowing"}]
    letter = _synthetic_letter(profile, lexicon, pulsar, neigh)
    joined = "\n".join(letter["body"])
    assert "JNEIGH" in joined


def test_synthetic_letter_handles_missing_lexicon_fields():
    profile, lexicon, pulsar = _sample()
    lexicon["lexicon"] = {}  # empty — should not crash
    letter = _synthetic_letter(profile, lexicon, pulsar, [])
    assert isinstance(letter["body"], list)
