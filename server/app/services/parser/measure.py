"""Numeric parsing for CP files, including unit-bearing limit strings.

Half the vendor formats found in the 2026-08 survey write their spec limits with
a unit attached — 天狼芯 "200.0mV", 禾纳 "2 V", 新洁能 "99.00uA" / "100.0nA".
A plain float() rejects all of those, which silently left those vendors with no
Q1 limits at all. Values are normalised to the SI base unit so a limit written
as "99.00uA" compares directly against a measurement recorded as 9.9e-05.
"""
from __future__ import annotations

import re
from typing import NamedTuple, Optional

# SI prefixes seen in CP dumps. Case matters: "m" is milli, "M" is mega.
SI_PREFIX: dict[str, float] = {
    "p": 1e-12, "n": 1e-9, "u": 1e-6, "µ": 1e-6, "μ": 1e-6,
    "m": 1e-3, "": 1.0, "k": 1e3, "K": 1e3, "M": 1e6, "G": 1e9,
}

# Units actually observed; kept explicit so a stray word is not read as a unit.
_UNITS = r"V|A|s|F|W|Hz|ohm|Ohm|OHM|Ω|%"

_NUM_UNIT_RE = re.compile(
    r"^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)"   # number
    r"\s*([pnuµμmkKMG]?)"                                 # SI prefix
    r"\s*(" + _UNITS + r")?\s*$"                          # unit
)


class Measure(NamedTuple):
    value: Optional[float]   # normalised to the SI base unit
    unit: Optional[str]      # base unit as written, e.g. "V"; None when bare
    raw: object              # the original cell value


def parse_measure(v: object) -> Measure:
    """Parse a cell into a Measure.

    Accepts plain numbers, numeric strings (including "+1.000E+00" and ".3"),
    and unit-bearing strings with an optional SI prefix. Returns
    ``Measure(None, None, v)`` when the cell is not a measurement.
    """
    if v is None:
        return Measure(None, None, v)
    if isinstance(v, bool):
        return Measure(None, None, v)
    if isinstance(v, (int, float)):
        return Measure(float(v), None, v)

    s = str(v).strip()
    if not s:
        return Measure(None, None, v)

    # Fast path: a bare number needs no unit handling.
    try:
        return Measure(float(s), None, v)
    except ValueError:
        pass

    m = _NUM_UNIT_RE.match(s)
    if not m:
        return Measure(None, None, v)

    num, prefix, unit = m.group(1), m.group(2), m.group(3)
    # "12E3" already parsed above; reaching here with neither prefix nor unit
    # means the string is not a measurement (e.g. a stray identifier).
    if not prefix and not unit:
        return Measure(None, None, v)

    try:
        scaled = float(num) * SI_PREFIX.get(prefix, 1.0)
    except (ValueError, OverflowError):
        return Measure(None, None, v)
    return Measure(scaled, unit, v)


def to_float(v: object) -> Optional[float]:
    """Value of a cell as a float, or None. Drop-in for the old _safe_float,
    but it now also understands unit-bearing strings."""
    return parse_measure(v).value


def is_numeric(v: object) -> bool:
    return parse_measure(v).value is not None
