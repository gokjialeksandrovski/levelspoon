"""Turn label text into numbers (spec §4.3).

EU labels use a decimal comma, and salt is sometimes printed in milligrams.
Both conversions happen here, and unreadable input raises rather than
returning a zero that would be indistinguishable from a real measurement.
"""

import re

MILLIGRAMS_PER_GRAM = 1000.0
NUMBER_WITH_UNIT = re.compile(r"(\d+(?:[.,]\d+)?)\s*(mg|g)?\b", re.IGNORECASE)


class NormalizationError(Exception):
    """Label text could not be read as a number."""


def to_grams(raw: str) -> float:
    """Parse one label value into grams.

    Handles decimal commas ("2,0 g") and milligram units ("180 mg" -> 0.18).
    """
    match = NUMBER_WITH_UNIT.search(raw)
    if match is None:
        raise NormalizationError(f"No numeric value found in {raw!r}")

    value = float(match.group(1).replace(",", "."))
    unit = (match.group(2) or "g").lower()

    return value / MILLIGRAMS_PER_GRAM if unit == "mg" else value
