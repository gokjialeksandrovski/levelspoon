"""Turn label text into numbers (spec §4.3).

EU labels use a decimal comma, and salt is sometimes printed in milligrams.
Both conversions happen here, and unreadable input raises rather than
returning a zero that would be indistinguishable from a real measurement.
"""

import re

from ..boxes import Box

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


ENERGY_FIGURE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(kj|kcal)", re.IGNORECASE)


def _energy_figures(text: str) -> dict[str, float]:
    """Map unit -> value for every kJ/kcal figure in one box's text."""
    return {
        unit.lower(): float(number.replace(",", "."))
        for number, unit in ENERGY_FIGURE.findall(text)
    }


def split_energy_row(boxes: tuple[Box, ...]) -> tuple[float, float, tuple[Box, ...]]:
    """Consume the energy row as one logical row, however OCR split it.

    EU Regulation 1169/2011 mandates energy in both kJ and kcal, so the row
    carries two numbers. Detecting it by unit marker - rather than assuming
    it occupies exactly one box - is what stops a split detection from
    shifting fat, saturates, carbohydrate, sugars, protein and salt each one
    position down the fixed row order (spec §4.3).
    """
    figures: dict[str, float] = {}
    consumed_indices: set[int] = set()

    for index, box in enumerate(boxes):
        found = _energy_figures(box.text)
        if not found:
            continue
        figures.update(found)
        consumed_indices.add(index)
        if "kj" in figures and "kcal" in figures:
            break

    if not consumed_indices:
        raise NormalizationError("No energy row found: no kJ or kcal marker detected")
    if "kcal" not in figures:
        raise NormalizationError(f"Energy row has no kcal figure: {figures}")
    if "kj" not in figures:
        raise NormalizationError(f"Energy row has no kJ figure: {figures}")

    remaining = tuple(
        box for index, box in enumerate(boxes) if index not in consumed_indices
    )
    return figures["kcal"], figures["kj"], remaining
