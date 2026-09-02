import pytest

from per100_ocr.boxes import Box, OcrResult
from per100_ocr.nutrition.normalize import NormalizationError
from per100_ocr.nutrition.us_label import ServingSizeUnknownError, _parse_us_label, is_us_label


def _box(text: str, y: float, x: float = 100.0) -> Box:
    return Box(text=text, x=x, y=y, confidence=0.95)


def _us_label(serving_size_text: str) -> OcrResult:
    boxes = (
        _box("Nutrition Facts", 100.0),
        _box(f"Serving Size {serving_size_text}", 150.0),
        _box("Amount Per Serving", 190.0),
        _box("Calories 156", 200.0),
        _box("Total Fat 8g 10%", 250.0),
        _box("Saturated Fat 1g 5%", 300.0),
        _box("Sodium 180mg 8%", 350.0),
        _box("Total Carbohydrate 18g 6%", 400.0),
        _box("Total Sugars 9g", 450.0),
        _box("Includes 2g Added Sugars", 470.0),
        _box("Protein 3g", 500.0),
        _box("% Daily Value", 550.0),
    )
    return OcrResult(boxes=boxes, image_width=1000, image_height=1600)


def test_is_us_label_true_for_nutrition_facts_marker():
    assert is_us_label(_us_label("2 Tbsp (30g)"))


def test_is_us_label_false_for_an_eu_label():
    result = OcrResult(boxes=(_box("100 g", 100.0),), image_width=1000, image_height=1400)
    assert not is_us_label(result)


def test_parses_all_seven_fields_and_scales_by_the_on_label_grams():
    reading = _parse_us_label(_us_label("2 Tbsp (30g)"))
    assert reading.values.energy_kcal == pytest.approx(156 / 30 * 100)
    assert reading.values.fat_g == pytest.approx(8 / 30 * 100)
    assert reading.values.protein_g == pytest.approx(3 / 30 * 100)
    assert reading.flags == ()


def test_converts_sodium_milligrams_to_salt_grams():
    reading = _parse_us_label(_us_label("2 Tbsp (30g)"))
    # 180 mg sodium -> 0.18 g -> x2.5 -> 0.45 g salt, scaled by 100/30
    assert reading.values.salt_g == pytest.approx(0.45 / 30 * 100)


def test_total_sugars_is_not_confused_with_added_sugars_line():
    reading = _parse_us_label(_us_label("2 Tbsp (30g)"))
    assert reading.values.sugars_g == pytest.approx(9 / 30 * 100)


def test_raises_serving_size_unknown_when_no_gram_weight_is_printed():
    with pytest.raises(ServingSizeUnknownError) as excinfo:
        _parse_us_label(_us_label("2 Tablespoon"))
    assert excinfo.value.serving_size_text == "Serving Size 2 Tablespoon"
    assert excinfo.value.per_serving_values.energy_kcal == 156.0


def test_serving_size_grams_ignores_a_word_starting_with_g_before_the_real_weight():
    # "4 gummies" must not be mistaken for a gram weight - only the
    # parenthesized "(12 g)" is a real printed gram weight.
    reading = _parse_us_label(_us_label("4 gummies (12 g)"))
    assert reading.values.energy_kcal == pytest.approx(156 / 12 * 100)


def test_serving_size_grams_ignores_graham_crackers_word_before_the_real_weight():
    reading = _parse_us_label(_us_label("2 graham crackers (31g)"))
    assert reading.values.energy_kcal == pytest.approx(156 / 31 * 100)


def test_raises_serving_size_unknown_when_measure_word_starts_with_g_but_has_no_weight():
    # "gummies" starts with "g" but there is no parenthesized gram weight at
    # all here - must not be mistaken for one.
    with pytest.raises(ServingSizeUnknownError) as excinfo:
        _parse_us_label(_us_label("5 gummies"))
    assert excinfo.value.serving_size_text == "Serving Size 5 gummies"


def test_raises_normalization_error_for_a_non_positive_printed_gram_weight():
    with pytest.raises(NormalizationError, match="Non-positive gram weight"):
        _parse_us_label(_us_label("2 Tbsp (0g)"))


def test_raises_normalization_error_when_a_required_row_is_unreadable():
    boxes = tuple(box for box in _us_label("2 Tbsp (30g)").boxes if not box.text.startswith("Protein"))
    result = OcrResult(boxes=boxes, image_width=1000, image_height=1600)
    with pytest.raises(NormalizationError, match="protein"):
        _parse_us_label(result)


def test_flags_a_sanity_rule_violation_via_validate():
    boxes = (
        _box("Nutrition Facts", 100.0),
        _box("Serving Size 2 Tbsp (30g)", 150.0),
        _box("Calories 156", 200.0),
        _box("Total Fat 8g", 250.0),
        _box("Saturated Fat 20g", 300.0),  # exceeds total fat
        _box("Sodium 180mg", 350.0),
        _box("Total Carbohydrate 18g", 400.0),
        _box("Total Sugars 9g", 450.0),
        _box("Protein 3g", 500.0),
    )
    result = OcrResult(boxes=boxes, image_width=1000, image_height=1600)
    reading = _parse_us_label(result)
    assert "saturates_g" in reading.flags
    assert "fat_g" in reading.flags
