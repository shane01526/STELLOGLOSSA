"""RA/DEC → IAU 88 個星座名稱。使用 astropy 內建對應表。"""
from __future__ import annotations

from astropy.coordinates import SkyCoord, get_constellation
import astropy.units as u


def ra_dec_to_constellation(ra: str, dec: str) -> str:
    """Accept sexagesimal strings like '04:37:15.8' / '-47:15:09' or decimal degrees as strings."""
    coord = SkyCoord(ra=ra, dec=dec, unit=(u.hourangle, u.deg))
    return get_constellation(coord)


def equatorial_to_galactic_cartesian(
    ra: str, dec: str, distance_kpc: float
) -> tuple[float, float, float]:
    """Convert to Galactic cartesian (kpc). Returns (x, y, z)."""
    coord = SkyCoord(
        ra=ra, dec=dec, unit=(u.hourangle, u.deg), distance=distance_kpc * u.kpc
    )
    galactic = coord.galactic.cartesian
    return (
        float(galactic.x.to(u.kpc).value),
        float(galactic.y.to(u.kpc).value),
        float(galactic.z.to(u.kpc).value),
    )
