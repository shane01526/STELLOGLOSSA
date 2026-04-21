import math

from src.core.contact_model import (
    build_graph,
    contact_regime,
    contact_weight,
    stellar_distance,
)


def _pulsar(name, xyz):
    return {"jname": name, "galactic_xyz_kpc": xyz, "constellation": "X", "dm": 10, "period_s": 0.1}


def test_distance_zero_for_same_point():
    a = _pulsar("A", [1, 2, 3])
    assert stellar_distance(a, a) == 0


def test_distance_euclidean():
    a = _pulsar("A", [0, 0, 0])
    b = _pulsar("B", [3, 4, 0])
    assert stellar_distance(a, b) == 5


def test_contact_weight_monotone_decreasing():
    assert contact_weight(0) > contact_weight(1) > contact_weight(5)


def test_contact_weight_matches_exp_formula():
    assert math.isclose(contact_weight(1.0, lam=1.0), math.exp(-1.0))


def test_contact_regimes_by_distance():
    assert contact_regime(0.1) == "borrowing"
    assert contact_regime(1.0) == "extension"
    assert contact_regime(3.0) == "narrowing"
    assert contact_regime(10.0) == "isolation"


def test_graph_cuts_long_edges():
    pulsars = [
        _pulsar("A", [0, 0, 0]),
        _pulsar("B", [1, 0, 0]),
        _pulsar("C", [100, 0, 0]),
    ]
    G = build_graph(pulsars, distance_cutoff_kpc=5.0)
    assert G.has_edge("A", "B")
    assert not G.has_edge("A", "C")
    assert not G.has_edge("B", "C")
