"""Turn one nutrition-table photograph's boxes into validated values.

Orchestration only: locate the column, consume the energy row, assign the
remaining six fields in the legally-fixed EU order, resolve decimals, and
validate. Each step lives in its own module.
"""

import math
from dataclasses import dataclass

from ..boxes import OcrResult
from .columns import find_per_100g_values
from .decimals import decimal_candidates, resolve_decimals
from .normalize import NormalizationError, split_energy_row
from .validate import NutritionValues

# Fixed by EU Regulation 1169/2011; never inferred from adjacent label text
# because the value column drifts out of alignment on curved packaging.
NUTRITION_ROW_ORDER = (
    "fat_g", "saturates_g", "carbohydrate_g", "sugars_g", "protein_g", "salt_g",
)

MISSING_VALUE = math.nan


@dataclass(frozen=True)
class NutritionReading:
    """Parsed values plus the fields the rules could not vouch for."""

    values: NutritionValues
    flags: tuple[str, ...]
    energy_kj: float | None


def _candidates_by_field(value_texts: list[str]) -> tuple[dict, list[str]]:
    """Map the fixed row order onto whatever values were detected."""
    candidates: dict[str, tuple[float, ...]] = {}
    missing: list[str] = []

    for index, field in enumerate(NUTRITION_ROW_ORDER):
        if index >= len(value_texts):
            candidates[field] = (MISSING_VALUE,)
            missing.append(field)
            continue
        try:
            candidates[field] = decimal_candidates(value_texts[index])
        except NormalizationError:
            candidates[field] = (MISSING_VALUE,)
            missing.append(field)

    return candidates, missing


def parse_nutrition(result: OcrResult) -> NutritionReading:
    """Read a nutrition table into validated per-100g values."""
    value_boxes = find_per_100g_values(result)
    energy_kcal, energy_kj, remaining = split_energy_row(value_boxes)

    candidates, missing = _candidates_by_field([box.text for box in remaining])
    values, flags = resolve_decimals(candidates, energy_kcal, energy_kj)

    return NutritionReading(
        values=values,
        flags=tuple(sorted(set(flags) | set(missing))),
        energy_kj=energy_kj,
    )
