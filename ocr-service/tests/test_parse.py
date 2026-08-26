import math

from per100_ocr.boxes import Box, OcrResult
from per100_ocr.nutrition.parse import parse_nutrition


def _box(text: str, y: float, x: float = 900.0) -> Box:
    return Box(text=text, x=x, y=y, confidence=0.95)


def _label(*value_texts: str) -> OcrResult:
    boxes = [_box("100 g", 100.0)]
    boxes += [_box(text, 200.0 + index * 100.0) for index, text in enumerate(value_texts)]
    boxes.append(_box("Masti", 200.0, x=100.0))
    return OcrResult(boxes=tuple(boxes), image_width=1000, image_height=1400)


def test_parses_the_golden_label():
    result = _label("295kJ/70 Kcal", "2,0 g", "1,2 g", "4,0 g", "4,0 g", "9,0 g", "0,18 g")
    reading = parse_nutrition(result)
    assert reading.values.energy_kcal == 70.0
    assert reading.values.fat_g == 2.0
    assert reading.values.salt_g == 0.18
    assert reading.energy_kj == 295.0
    assert reading.flags == ()


def test_parses_a_label_with_energy_split_across_two_boxes():
    """Eight numeric boxes must still map onto seven logical fields."""
    result = _label("295 kJ", "70 kcal", "2,0 g", "1,2 g", "4,0 g", "4,0 g", "9,0 g", "0,18 g")
    reading = parse_nutrition(result)
    assert reading.values.fat_g == 2.0
    assert reading.values.protein_g == 9.0
    assert reading.flags == ()


def test_recovers_a_dropped_decimal_separator():
    result = _label("295kJ/70 Kcal", "20g", "1,2 g", "4,0 g", "4,0 g", "9,0 g", "0,18 g")
    assert parse_nutrition(result).values.fat_g == 2.0


def test_flags_a_missing_row_rather_than_defaulting_it():
    result = _label("295kJ/70 Kcal", "2,0 g", "1,2 g", "4,0 g", "4,0 g", "9,0 g")
    reading = parse_nutrition(result)
    assert "salt_g" in reading.flags


def test_missing_row_is_never_silently_zero():
    """saturates_g and sugars_g never enter validate()'s component-total sum
    and only appear in > comparisons (always False for nan), so validate()
    alone can never catch either missing - proving the `missing`-list union
    in parse_nutrition is load-bearing, not redundant (spec §4.4).
    """
    result = _label("295kJ/70 Kcal", "2,0 g", "od kojih", "4,0 g", "4,0 g", "9,0 g", "0,18 g")
    reading = parse_nutrition(result)
    assert math.isnan(reading.values.saturates_g)
    assert "saturates_g" in reading.flags
