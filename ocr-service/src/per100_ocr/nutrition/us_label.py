"""Parse US FDA "Nutrition Facts" labels into the app's 7-field per-100g model.

US labels report per-serving values with no "100g" header, "Calories"
instead of kJ/kcal, and Sodium (mg) instead of Salt (g) - different enough
from columns.py's header-anchored column detection that this is a separate,
independent pass rather than a variant of the EU parser (spec §2.2). The
row-detection regexes below are a first pass, to be tuned against a real
US-label fixture the same way the EU column detection was originally tuned.
"""

import re
from dataclasses import asdict

from ..boxes import OcrResult
from .normalize import NormalizationError, to_grams
from .reading import NutritionReading
from .validate import NutritionValues, validate

# Salt = sodium x 2.5, the standard regulatory conversion (EU Reg 1169/2011
# Annex I; FDA uses the same factor) derived from NaCl's molar-mass ratio to
# sodium alone - a fixed constant, not a guess.
SODIUM_TO_SALT_FACTOR = 2.5

PER_100G_GRAMS = 100.0

US_LABEL_MARKERS = (
    re.compile(r"nutrition facts", re.IGNORECASE),
    re.compile(r"amount per serving", re.IGNORECASE),
    re.compile(r"%\s*daily value", re.IGNORECASE),
)

# Anchored to each row's start so "Total Sugars" never also matches the
# "Includes Xg Added Sugars" line beneath it (spec §2.2). Keyed by
# NutritionValues field name, except "sodium_g" - converted to salt_g below.
ROW_MARKERS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("energy_kcal", re.compile(r"^calories\b", re.IGNORECASE)),
    ("fat_g", re.compile(r"^total fat\b", re.IGNORECASE)),
    ("saturates_g", re.compile(r"^saturated fat\b", re.IGNORECASE)),
    ("sodium_g", re.compile(r"^sodium\b", re.IGNORECASE)),
    ("carbohydrate_g", re.compile(r"^total carbohydrate\b", re.IGNORECASE)),
    ("sugars_g", re.compile(r"^total sugars\b", re.IGNORECASE)),
    ("protein_g", re.compile(r"^protein\b", re.IGNORECASE)),
)

SERVING_SIZE_LINE = re.compile(r"serving size", re.IGNORECASE)
SERVING_SIZE_GRAMS = re.compile(r"\(?\s*(\d+(?:[.,]\d+)?)\s*g\s*\)?", re.IGNORECASE)


class ServingSizeUnknownError(Exception):
    """A US label had all 7 fields readable but no gram weight to scale by."""

    def __init__(self, serving_size_text: str, per_serving_values: NutritionValues):
        super().__init__(f"No gram weight found for serving size: {serving_size_text!r}")
        self.serving_size_text = serving_size_text
        self.per_serving_values = per_serving_values


def is_us_label(result: OcrResult) -> bool:
    """True when the photo carries a US-only marker no EU label prints."""
    return any(marker.search(box.text) for box in result.boxes for marker in US_LABEL_MARKERS)


def _row_value(result: OcrResult, marker: re.Pattern[str]) -> float:
    """Find the row matching `marker` and read its value via `to_grams`.

    Stripping the matched label prefix before handing the remainder to
    `to_grams` reuses the EU parser's exact decimal-comma and mg->g handling
    for a merged OCR line like "Total Fat 8g 10%", instead of duplicating it.
    """
    for box in result.boxes:
        text = box.text.strip()
        header_match = marker.match(text)
        if header_match is None:
            continue
        return to_grams(text[header_match.end():])
    raise NormalizationError(f"Row not found for marker: {marker.pattern!r}")


def _serving_size_text(result: OcrResult) -> str:
    for box in result.boxes:
        if SERVING_SIZE_LINE.search(box.text):
            return box.text.strip()
    raise NormalizationError("No serving size line found on US label")


def _serving_size_grams(serving_size_text: str) -> float | None:
    """A gram weight printed alongside the household measure, if any.

    "Serving size 2 Tbsp (30g)" resolves right here; "Serving size 2
    Tablespoon" (no parenthetical) returns None, triggering the OmniRoute
    fallback (spec §2.3).
    """
    match = SERVING_SIZE_GRAMS.search(serving_size_text)
    return float(match.group(1).replace(",", ".")) if match else None


def _scale_to_per_100g(values: NutritionValues, grams: float) -> NutritionValues:
    scale = PER_100G_GRAMS / grams
    return NutritionValues(**{field: value * scale for field, value in asdict(values).items()})


def _parse_us_label(result: OcrResult) -> NutritionReading:
    readings = {field: _row_value(result, marker) for field, marker in ROW_MARKERS}
    sodium_g = readings.pop("sodium_g")
    per_serving_values = NutritionValues(salt_g=sodium_g * SODIUM_TO_SALT_FACTOR, **readings)

    serving_size_text = _serving_size_text(result)
    grams = _serving_size_grams(serving_size_text)
    if grams is None:
        raise ServingSizeUnknownError(serving_size_text, per_serving_values)

    values = _scale_to_per_100g(per_serving_values, grams)
    return NutritionReading(values=values, flags=validate(values, energy_kj=None), energy_kj=None)
