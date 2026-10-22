"""Recover decimal separators PaddleOCR drops - but only when provably needed.

PaddleOCR occasionally loses the decimal comma on tight-kerned digits
("2,0 g" read as "20g"), a 10x error if trusted. A blanket rule would
corrupt a genuine "72 g" carbohydrate into "7.2 g" - the same error in the
opposite direction. Here the §4.4 rules decide, and
anything they cannot settle is flagged for the user (spec §4.4).
"""

import re

from .normalize import to_grams
from .validate import NutritionValues, validate

# A bare two-digit value with NO unit suffix at all ("12") is the same
# dropped-decimal failure as "12g" - just with the unit lost too. Observed
# on the real Olympus label: saturates printed as "1,2 g" was read as "12"
# (spec §4.4, confirmed against
# fixtures/ocr-boxes/olympus-greek-2pct-nutrition.json).
BARE_TWO_DIGIT_GRAMS = re.compile(r"^\s*(\d)(\d)\s*(?:g)?\s*$", re.IGNORECASE)
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


def _unsettled_fields(
    readings: dict[str, float],
    candidates: dict[str, tuple[float, ...]],
    energy_kcal: float,
    energy_kj: float | None,
) -> tuple[str, ...]:
    """Fields whose other candidate also validates against the adopted
    reading - genuinely ambiguous even though the composite as a whole
    passed, and must still be flagged rather than silently accepted.
    """
    unsettled: list[str] = []
    for field, options in candidates.items():
        if len(options) < MIN_AMBIGUOUS_OPTIONS:
            continue
        other = options[0] if readings[field] == options[-1] else options[-1]
        flipped = _values_from({**readings, field: other}, energy_kcal)
        if not validate(flipped, energy_kj):
            unsettled.append(field)
    return tuple(sorted(unsettled))


def resolve_decimals(
    candidates: dict[str, tuple[float, ...]],
    energy_kcal: float,
    energy_kj: float | None,
) -> tuple[NutritionValues, tuple[str, ...]]:
    """Pick a reading per field, flagging any the rules cannot settle.

    Tries two composite readings first: every field at its most literal
    candidate, and every field at its most decimal-corrected candidate.
    A single dropped decimal rarely occurs alone - OCR that drops one
    field's separator often drops several on the same label (confirmed
    against the real Olympus photo, where fat, carbohydrate and sugars all
    lost their decimal simultaneously). Testing one field at a time while
    its neighbours stay wrong can never recover this, since the Atwater
    check needs several fields correct at once. Falls back to the original
    per-field approach when neither composite reading validates cleanly on
    its own - which is what flags a field the rules genuinely can't settle.
    """
    literal_reading = {field: options[0] for field, options in candidates.items()}
    corrected_reading = {field: options[-1] for field, options in candidates.items()}

    literal_values = _values_from(literal_reading, energy_kcal)
    corrected_values = _values_from(corrected_reading, energy_kcal)
    literal_passes = not validate(literal_values, energy_kj)
    corrected_passes = not validate(corrected_values, energy_kj)

    if literal_passes and not corrected_passes:
        return literal_values, _unsettled_fields(
            literal_reading, candidates, energy_kcal, energy_kj
        )
    if corrected_passes and not literal_passes:
        return corrected_values, _unsettled_fields(
            corrected_reading, candidates, energy_kcal, energy_kj
        )

    readings = dict(literal_reading)
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
