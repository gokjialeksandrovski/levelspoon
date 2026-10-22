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
from .reading import LabelFormat, NutritionReading
from .us_label import is_us_label, read_us_label

# Fixed by EU Regulation 1169/2011; never inferred from adjacent label text
# because the value column drifts out of alignment on curved packaging.
# Fibre is optional in that regulation and prints between sugars and protein,
# so a label carrying it yields one more value row than one that does not.
EU_ROW_ORDER = (
    "fat_g",
    "saturates_g",
    "carbohydrate_g",
    "sugars_g",
    "protein_g",
    "salt_g",
)
EU_ROW_ORDER_WITH_FIBRE = (
    "fat_g",
    "saturates_g",
    "carbohydrate_g",
    "sugars_g",
    "fibre_g",
    "protein_g",
    "salt_g",
)

MISSING_VALUE = math.nan


def _row_order(value_count: int) -> tuple[str, ...]:
    """Which printed row order this label used, decided by count alone.

    Only an exact seven means fibre. More than that means another optional
    row (polyols, starch) is present too, and a count cannot say which - so
    that case keeps the six-row mapping rather than guessing a new one.
    """
    if value_count == len(EU_ROW_ORDER_WITH_FIBRE):
        return EU_ROW_ORDER_WITH_FIBRE
    return EU_ROW_ORDER


def _candidates_by_field(
    value_texts: list[str],
) -> tuple[dict[str, tuple[float, ...]], list[str]]:
    """Map the printed row order onto whatever values were detected."""
    candidates: dict[str, tuple[float, ...]] = {}
    missing: list[str] = []

    for index, field in enumerate(_row_order(len(value_texts))):
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
        label_format=LabelFormat.EU,
        per_100g=values,
        per_serving=None,
        flags=tuple(sorted(set(flags) | set(missing))),
        energy_kj=energy_kj,
        serving_size_text=None,
        serving_grams=None,
        servings_per_container=None,
    )


def _parse_us_label(result: OcrResult) -> NutritionReading:
    """Report a US label as printed.

    No flags are returned: validate()'s rules are per-100g rules, and applying
    them to per-serving figures would flag a correct label. The caller
    validates once it has scaled.
    """
    reading = read_us_label(result)
    return NutritionReading(
        label_format=LabelFormat.US,
        per_100g=None,
        per_serving=reading.per_serving,
        flags=(),
        energy_kj=None,
        serving_size_text=reading.serving_size_text,
        serving_grams=reading.serving_grams,
        servings_per_container=reading.servings_per_container,
    )


def parse_nutrition(result: OcrResult) -> NutritionReading:
    """Read a nutrition table into validated per-100g values."""
    try:
        return _parse_eu_label(result)
    except ColumnDetectionError:
        if is_us_label(result):
            return _parse_us_label(result)
        raise
