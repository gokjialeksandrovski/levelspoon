"""Recover decimal separators PaddleOCR drops - but only when provably needed.

PaddleOCR occasionally loses the decimal comma on tight-kerned digits
("2,0 g" read as "20g"), a 10x error if trusted. The spike fixed this with a
blanket rule, which would corrupt a genuine "72 g" carbohydrate into "7.2 g" -
the same error in the opposite direction. Here the §4.4 rules decide, and
anything they cannot settle is flagged for the user (spec §4.4).
"""

import re

from .normalize import to_grams
from .validate import NutritionValues, validate

BARE_TWO_DIGIT_GRAMS = re.compile(r"^\s*(\d)(\d)\s*g\s*$", re.IGNORECASE)
MIN_AMBIGUOUS_OPTIONS = 2


def decimal_candidates(raw: str) -> tuple[float, ...]:
    """Readings of one value, most literal first."""
    literal = to_grams(raw)
    match = BARE_TWO_DIGIT_GRAMS.match(raw)
    if match is None:
        return (literal,)
    return (literal, float(f"{match.group(1)}.{match.group(2)}"))


def _values_from(readings: dict[str, float], energy_kcal: float) -> NutritionValues:
    return NutritionValues(energy_kcal=energy_kcal, **readings)


def resolve_decimals(
    candidates: dict[str, tuple[float, ...]],
    energy_kcal: float,
    energy_kj: float | None,
) -> tuple[NutritionValues, tuple[str, ...]]:
    """Pick a reading per field, flagging any the rules cannot settle."""
    readings = {field: options[0] for field, options in candidates.items()}
    ambiguous_flags: list[str] = []

    for field, options in candidates.items():
        if len(options) < MIN_AMBIGUOUS_OPTIONS:
            continue

        passing = [
            option
            for option in options
            if not validate(
                _values_from({**readings, field: option}, energy_kcal), energy_kj
            )
        ]

        if len(passing) == 1:
            readings[field] = passing[0]
        else:
            ambiguous_flags.append(field)

    values = _values_from(readings, energy_kcal)
    flags = tuple(sorted(set(validate(values, energy_kj)) | set(ambiguous_flags)))
    return values, flags
