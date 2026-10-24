"""Turn label text into numbers (spec §4.3).

EU labels use a decimal comma, and salt is sometimes printed in milligrams.
Both conversions happen here, and unreadable input raises rather than
returning a zero that would be indistinguishable from a real measurement.
"""

import re

from ..boxes import Box
from .validate import KJ_PER_KCAL, KJ_TOLERANCE

MILLIGRAMS_PER_GRAM = 1000.0
# No word boundary after the number: a letter touching it ("0,60г", or "8,23r"
# where OCR read a Cyrillic г) would otherwise make the match backtrack and
# drop the decimal part, a silent 10x-100x error that still passes Atwater.
NUMBER_WITH_UNIT = re.compile(r"(\d+(?:[.,]\d+)?)(?:\s*(mg)\b)?", re.IGNORECASE)


class NormalizationError(Exception):
    """Label text could not be read as a number."""


def _number(text: str) -> float:
    return float(text.replace(",", "."))


def to_grams(raw: str) -> float:
    """Parse one label value into grams.

    Handles decimal commas ("2,0 g") and milligram units ("180 mg" -> 0.18).
    """
    match = NUMBER_WITH_UNIT.search(raw)
    if match is None:
        raise NormalizationError(f"No numeric value found in {raw!r}")

    value = _number(match.group(1))
    unit = (match.group(2) or "g").lower()

    return value / MILLIGRAMS_PER_GRAM if unit == "mg" else value


ENERGY_FIGURE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(kj|kcal)", re.IGNORECASE)

# A label that prints the units once, in the row description ("Energy value
# (kJ/kcal)"), leaves a bare "112.71/26.96" in the value cell.
UNITLESS_ENERGY_PAIR = re.compile(r"^\s*(\d+(?:[.,]\d+)?)\s*/\s*(\d+(?:[.,]\d+)?)\s*$")


def _energy_figures(text: str) -> dict[str, float]:
    """Map unit -> value for every kJ/kcal figure in one box's text."""
    return {
        unit.lower(): _number(number) for number, unit in ENERGY_FIGURE.findall(text)
    }


def _unitless_energy_pair(text: str) -> dict[str, float]:
    """A bare A/B pair whose ratio is the kJ-per-kcal factor, larger as kJ.

    The ratio is the proof it is energy: no other pair of figures on a label
    stands in that ratio by chance.
    """
    match = UNITLESS_ENERGY_PAIR.match(text)
    if match is None:
        return {}
    kcal, kj = sorted(_number(group) for group in match.groups())
    expected_kj = kcal * KJ_PER_KCAL
    if abs(kj - expected_kj) > expected_kj * KJ_TOLERANCE:
        return {}
    return {"kj": kj, "kcal": kcal}


def split_energy_row(
    boxes: tuple[Box, ...],
) -> tuple[float | None, float | None, tuple[Box, ...]]:
    """Consume the energy row as one logical row, however OCR split it.

    EU Regulation 1169/2011 mandates energy in both kJ and kcal, so the row
    carries two numbers. Detecting it by unit marker - rather than assuming
    it occupies exactly one box - is what stops a split detection from
    shifting fat, saturates, carbohydrate, sugars, protein and salt each one
    position down the fixed row order (spec §4.3).

    A figure that could not be read comes back as None rather than raising:
    the macros beside it are still worth returning, and the caller flags it.
    """
    figures: dict[str, float] = {}
    consumed_indices: set[int] = set()

    for index, box in enumerate(boxes):
        found = _energy_figures(box.text) or _unitless_energy_pair(box.text)
        if not found:
            continue
        figures.update(found)
        consumed_indices.add(index)
        if "kj" in figures and "kcal" in figures:
            break

    remaining = tuple(
        box for index, box in enumerate(boxes) if index not in consumed_indices
    )
    return figures.get("kcal"), figures.get("kj"), remaining
