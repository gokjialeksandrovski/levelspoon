"""Turn one nutrition-table photograph's boxes into validated values.

Orchestration only: try the EU per-100g column layout first; if no 100g
header is found, parse a US Nutrition Facts label when the photo carries its
markers, else a declaration printed as running text. Each step lives in its
own module.
"""

import math

from ..boxes import Box, OcrResult
from .columns import ColumnDetectionError, find_per_100g_values, per_100_basis_unit
from .decimals import decimal_candidates, resolve_decimals
from .normalize import NormalizationError, split_energy_row
from .prose import names_a_field, read_declaration
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


def _eu_reading(
    candidates: dict[str, tuple[float, ...]],
    suspect: list[str],
    energy_kcal: float | None,
    energy_kj: float | None,
    basis_unit: str,
) -> NutritionReading:
    """Resolve and validate per-100 figures, flagging every suspect one.

    Unread energy is flagged, never a reason to discard the macros read
    beside it: the confirm step asks for the one blank figure.
    """
    kcal = MISSING_VALUE if energy_kcal is None else energy_kcal
    values, flags = resolve_decimals(candidates, kcal, energy_kj)
    unread = [*suspect, *(["energy_kcal"] if energy_kcal is None else [])]

    return NutritionReading(
        label_format=LabelFormat.EU,
        per_100g=values,
        per_serving=None,
        flags=tuple(sorted(set(flags) | set(unread))),
        energy_kj=energy_kj,
        serving_size_text=None,
        serving_grams=None,
        servings_per_container=None,
        basis_unit=basis_unit,
    )


def _split_table_energy(
    value_boxes: tuple[Box, ...],
) -> tuple[float | None, float | None, tuple[Box, ...]]:
    """split_energy_row, refusing an energy figure that sits in running text.

    A table's energy cell never names another nutrient. One that does ("Per
    100 g: energy 1046 kJ / 250 kcal, fat 10 g,") is a sentence, and mapping
    the lines after it by position would shift every figure.
    """
    energy_kcal, energy_kj, remaining = split_energy_row(value_boxes)
    if any(names_a_field(box.text) for box in value_boxes if box not in remaining):
        raise ColumnDetectionError(
            "The energy figure sits in running text, not a table"
        )
    return energy_kcal, energy_kj, remaining


def _parse_eu_label(result: OcrResult) -> NutritionReading:
    value_boxes = find_per_100g_values(result)
    energy_kcal, energy_kj, remaining = _split_table_energy(value_boxes)
    candidates, missing = _candidates_by_field([box.text for box in remaining])
    energy_found = energy_kcal is not None or energy_kj is not None
    # Without the energy row, only a column holding every row is a table at
    # all (a "per 100 g" claim on the front of a pack holds none).
    if not energy_found and missing:
        raise ColumnDetectionError(
            f"No energy row, and the column is missing {', '.join(missing)}"
        )
    # Nor does anything then show the first box is fat rather than an energy
    # row OCR garbled, so every position is suspect.
    suspect = missing if energy_found else list(candidates)
    return _eu_reading(
        candidates, suspect, energy_kcal, energy_kj, per_100_basis_unit(result)
    )


def _parse_prose_label(result: OcrResult) -> NutritionReading:
    declaration = read_declaration(result)
    candidates: dict[str, tuple[float, ...]] = {}
    missing: list[str] = []
    for field in EU_ROW_ORDER_WITH_FIBRE:
        if field in declaration.figures:
            candidates[field] = decimal_candidates(declaration.figures[field])
        elif field in EU_ROW_ORDER:
            candidates[field] = (MISSING_VALUE,)
            missing.append(field)
    return _eu_reading(
        candidates,
        missing,
        declaration.energy_kcal,
        declaration.energy_kj,
        declaration.basis_unit,
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
        basis_unit=None,
    )


def parse_nutrition(result: OcrResult) -> NutritionReading:
    """Read a nutrition table into validated per-100g values."""
    try:
        return _parse_eu_label(result)
    except ColumnDetectionError:
        if is_us_label(result):
            return _parse_us_label(result)
        return _parse_prose_label(result)
