"""Turn one nutrition-table photograph's boxes into validated values.

Orchestration only: try the EU per-100g column layout first; if no 100g
header is found but the photo carries US Nutrition Facts markers, parse
that layout instead. Each step lives in its own module.
"""

import math

from ..boxes import OcrResult
from .columns import ColumnDetectionError, find_per_100g_values
from .decimals import decimal_candidates, resolve_decimals
from .normalize import NormalizationError, split_energy_row
from .reading import NutritionReading
from .us_label import _parse_us_label, is_us_label

# Fixed by EU Regulation 1169/2011; never inferred from adjacent label text
# because the value column drifts out of alignment on curved packaging.
NUTRITION_ROW_ORDER = (
    "fat_g", "saturates_g", "carbohydrate_g", "sugars_g", "protein_g", "salt_g",
)

MISSING_VALUE = math.nan


def _candidates_by_field(
    value_texts: list[str],
) -> tuple[dict[str, tuple[float, ...]], list[str]]:
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


def _parse_eu_label(result: OcrResult) -> NutritionReading:
    value_boxes = find_per_100g_values(result)
    energy_kcal, energy_kj, remaining = split_energy_row(value_boxes)

    candidates, missing = _candidates_by_field([box.text for box in remaining])
    values, flags = resolve_decimals(candidates, energy_kcal, energy_kj)

    return NutritionReading(
        values=values,
        flags=tuple(sorted(set(flags) | set(missing))),
        energy_kj=energy_kj,
    )


def parse_nutrition(result: OcrResult) -> NutritionReading:
    """Read a nutrition table into validated per-100g values."""
    try:
        return _parse_eu_label(result)
    except ColumnDetectionError:
        if is_us_label(result):
            return _parse_us_label(result)
        raise
