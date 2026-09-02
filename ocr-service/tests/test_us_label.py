import pytest

from per100_ocr.boxes import Box, OcrResult
from per100_ocr.nutrition.normalize import NormalizationError
from per100_ocr.nutrition.us_label import is_us_label, read_us_label


def _box(text: str, y: float, x: float = 100.0) -> Box:
    return Box(text=text, x=x, y=y, confidence=0.95)


# Rows sit 70px apart on a 1600px-tall image (4.4% of height), the spacing
# measured off a real photographed FDA label via POST /debug/boxes. Earlier
# revisions of this fixture spaced rows at 2.5% of height - closer together
# than any real label prints them - which made row grouping look broken.
ROW_PITCH = 70.0


def _us_label(serving_size_text: str) -> OcrResult:
    boxes = (
        _box("Nutrition Facts", ROW_PITCH * 1),
        _box(f"Serving Size {serving_size_text}", ROW_PITCH * 2),
        _box("Amount Per Serving", ROW_PITCH * 3),
        _box("Calories 156", ROW_PITCH * 4),
        _box("Total Fat 8g 10%", ROW_PITCH * 5),
        _box("Saturated Fat 1g 5%", ROW_PITCH * 6),
        _box("Sodium 180mg 8%", ROW_PITCH * 7),
        _box("Total Carbohydrate 18g 6%", ROW_PITCH * 8),
        _box("Total Sugars 9g", ROW_PITCH * 9),
        _box("Includes 2g Added Sugars", ROW_PITCH * 10),
        _box("Protein 3g", ROW_PITCH * 11),
        _box("% Daily Value", ROW_PITCH * 12),
    )
    return OcrResult(boxes=boxes, image_width=1000, image_height=1600)


def test_is_us_label_true_for_nutrition_facts_marker():
    assert is_us_label(_us_label("2 Tbsp (30g)"))


def test_is_us_label_false_for_an_eu_label():
    result = OcrResult(boxes=(_box("100 g", 100.0),), image_width=1000, image_height=1400)
    assert not is_us_label(result)


def test_parses_all_seven_fields_and_scales_by_the_on_label_grams():
    reading = read_us_label(_us_label("2 Tbsp (30g)"))
    assert reading.per_serving.energy_kcal == pytest.approx(156.0)
    assert reading.serving_grams == pytest.approx(30.0)


def test_converts_sodium_milligrams_to_salt_grams():
    reading = read_us_label(_us_label("2 Tbsp (30g)"))
    # 180 mg sodium -> 0.18 g -> x2.5 -> 0.45 g salt
    assert reading.per_serving.salt_g == pytest.approx(0.45)


def test_total_sugars_is_not_confused_with_added_sugars_line():
    reading = read_us_label(_us_label("2 Tbsp (30g)"))
    assert reading.per_serving.sugars_g == pytest.approx(9.0)


def test_raises_serving_size_unknown_when_no_gram_weight_is_printed():
    reading = read_us_label(_us_label("2 Tablespoon"))
    assert reading.serving_grams is None
    assert "2 Tablespoon" in reading.serving_size_text


def test_serving_size_grams_ignores_a_word_starting_with_g_before_the_real_weight():
    # "4 gummies" must not be mistaken for a gram weight - only the
    # parenthesized "(12 g)" is a real printed gram weight.
    reading = read_us_label(_us_label("4 gummies (12 g)"))
    assert reading.serving_grams == pytest.approx(12.0)


def test_serving_size_grams_ignores_graham_crackers_word_before_the_real_weight():
    reading = read_us_label(_us_label("2 graham crackers (31g)"))
    assert reading.serving_grams == pytest.approx(31.0)


def test_raises_normalization_error_for_a_non_positive_printed_gram_weight():
    with pytest.raises(NormalizationError, match="Non-positive gram weight"):
        read_us_label(_us_label("2 Tbsp (0g)"))


def _real_split_calories_and_serving_label() -> OcrResult:
    """Boxes captured from a real photographed 2016-format FDA label
    (516x387px) via POST /debug/boxes. The prominent "200" Calories figure
    and the "2 Tablespoon" serving measure both land in their own OCR boxes,
    separate from their labels - unlike every synthetic fixture above, which
    merges label and value into one box."""
    boxes = (
        Box("Nutrition Facts", x=256.5, y=19.5, confidence=0.9997),
        Box("20 servings per container", x=216.5, y=46.5, confidence=0.9999),
        Box("Serving size", x=176.0, y=67.0, confidence=0.9999),
        Box("2 Tablespoon", x=334.0, y=67.0, confidence=0.9990),
        Box("Amount Per Serving", x=192.0, y=94.0, confidence=0.9996),
        Box("200", x=355.0, y=109.5, confidence=0.9999),
        Box("Calories", x=182.5, y=114.0, confidence=0.9999),
        Box("% Daily Value*", x=351.5, y=139.5, confidence=0.9784),
        Box("Total Fat 12g", x=169.0, y=154.5, confidence=0.9999),
        Box("15%", x=371.5, y=155.0, confidence=0.9999),
        Box("Saturated Fat 4g", x=192.0, y=172.0, confidence=0.9999),
        Box("20%", x=371.0, y=172.0, confidence=0.9999),
        Box("Trans Fat 0g", x=181.0, y=190.0, confidence=0.9982),
        Box("Cholesterol 5mg", x=178.5, y=206.0, confidence=0.9999),
        Box("2%", x=374.0, y=206.5, confidence=0.9999),
        Box("Sodium 15mg", x=171.0, y=222.0, confidence=0.9900),
        Box("1%", x=374.5, y=223.0, confidence=0.9999),
        Box("Total Carbohydrate 23g", x=198.5, y=240.0, confidence=0.9999),
        Box("8%", x=374.0, y=240.0, confidence=0.9991),
        Box("Dietary Fiber 1g", x=190.5, y=257.0, confidence=0.9998),
        Box("4%", x=374.0, y=257.0, confidence=0.9999),
        Box("Total Sugars 21g", x=193.5, y=274.0, confidence=0.9999),
        Box("Includes 0g Added Sugars", x=233.0, y=290.0, confidence=0.9967),
        Box("0%", x=374.0, y=290.0, confidence=0.9999),
        Box("Protein 2g", x=161.0, y=307.0, confidence=0.9999),
        Box("4%", x=374.5, y=307.0, confidence=0.9999),
    )
    return OcrResult(boxes=boxes, image_width=516, image_height=387)


def test_reads_calories_and_serving_size_when_ocr_splits_them_from_their_labels():
    """Real-world regression, captured from a real photo's POST /debug/boxes
    output: the prominent Calories numeral, and the serving-size measure,
    both sit far enough from their labels that OCR detects them as separate
    boxes - unlike every synthetic fixture above, which merges label and
    value into one box. Must not require them merged, and the joined
    serving-size text must still carry the full measure ("...2 Tablespoon")
    for the OmniRoute grams-estimation prompt - not just the bare label."""
    reading = read_us_label(_real_split_calories_and_serving_label())
    assert reading.per_serving.fat_g == pytest.approx(12.0)
    assert reading.per_serving.carbohydrate_g == pytest.approx(23.0)
    assert "2 Tablespoon" in reading.serving_size_text
    assert reading.serving_grams is None


def test_reads_a_row_whose_value_ocrs_to_the_left_of_its_label():
    """A skewed or column-ruled photo can order a row's boxes value-first.

    Row membership is decided by vertical position, so the row's text is
    reassembled left-to-right and matched as one line - the marker no longer
    has to be the first box on the row.
    """
    boxes = (
        _box("Nutrition Facts", ROW_PITCH * 1, x=100.0),
        _box("Serving Size 2 Tbsp (30g)", ROW_PITCH * 2, x=100.0),
        _box("156", ROW_PITCH * 3, x=80.0),
        _box("Calories", ROW_PITCH * 3, x=140.0),
        _box("Total Fat", ROW_PITCH * 4, x=100.0),
        _box("8g", ROW_PITCH * 4, x=300.0),
        _box("Saturated Fat 1g", ROW_PITCH * 5, x=100.0),
        _box("Sodium 180mg", ROW_PITCH * 6, x=100.0),
        _box("Total Carbohydrate", ROW_PITCH * 7, x=100.0),
        _box("18g", ROW_PITCH * 7, x=300.0),
        _box("Total Sugars 9g", ROW_PITCH * 8, x=100.0),
        _box("Protein 3g", ROW_PITCH * 9, x=100.0),
    )
    reading = read_us_label(OcrResult(boxes=boxes, image_width=1000, image_height=1600))
    assert reading.per_serving.energy_kcal == pytest.approx(156.0)
    assert reading.per_serving.fat_g == pytest.approx(8.0)
    assert reading.per_serving.carbohydrate_g == pytest.approx(18.0)


def test_reads_a_row_split_across_three_boxes():
    """OCR can break one printed row into label, value and %DV boxes."""
    boxes = (
        _box("Nutrition Facts", ROW_PITCH * 1, x=100.0),
        _box("Serving Size 2 Tbsp (30g)", ROW_PITCH * 2, x=100.0),
        _box("Calories 156", ROW_PITCH * 3, x=100.0),
        _box("Total Fat", ROW_PITCH * 4, x=100.0),
        _box("8g", ROW_PITCH * 4, x=250.0),
        _box("10%", ROW_PITCH * 4, x=400.0),
        _box("Saturated Fat 1g", ROW_PITCH * 5, x=100.0),
        _box("Sodium 180mg", ROW_PITCH * 6, x=100.0),
        _box("Total Carbohydrate 18g", ROW_PITCH * 7, x=100.0),
        _box("Total Sugars 9g", ROW_PITCH * 8, x=100.0),
        _box("Protein 3g", ROW_PITCH * 9, x=100.0),
    )
    reading = read_us_label(OcrResult(boxes=boxes, image_width=1000, image_height=1600))
    assert reading.per_serving.fat_g == pytest.approx(8.0)


def test_ignores_a_percent_daily_value_standing_where_the_gram_figure_belongs():
    """"Protein 4%" is a %DV, not 4 grams - the gram figure must win."""
    boxes = (
        _box("Nutrition Facts", ROW_PITCH * 1, x=100.0),
        _box("Serving Size 2 Tbsp (30g)", ROW_PITCH * 2, x=100.0),
        _box("Calories 156", ROW_PITCH * 3, x=100.0),
        _box("Total Fat 8g", ROW_PITCH * 4, x=100.0),
        _box("Saturated Fat 1g", ROW_PITCH * 5, x=100.0),
        _box("Sodium 180mg", ROW_PITCH * 6, x=100.0),
        _box("Total Carbohydrate 18g", ROW_PITCH * 7, x=100.0),
        _box("Total Sugars 9g", ROW_PITCH * 8, x=100.0),
        _box("Protein", ROW_PITCH * 9, x=100.0),
        _box("3g", ROW_PITCH * 9, x=250.0),
        _box("4%", ROW_PITCH * 9, x=400.0),
    )
    reading = read_us_label(OcrResult(boxes=boxes, image_width=1000, image_height=1600))
    assert reading.per_serving.protein_g == pytest.approx(3.0)


def _snickers_linear_label() -> OcrResult:
    """Boxes captured from a real photographed FDA linear (side-by-side) label
    (600x325px) via POST /debug/boxes - the photo that produced the reported
    422. Left and right columns share y-coordinates and consecutive printed
    rows sit ~10px apart against ~130px between columns, so any y-only row
    clustering merges the two columns into one line."""
    boxes = (
        Box("Amount/serving", x=167.0, y=180.0, confidence=0.98),
        Box("Amount/serving", x=302.0, y=180.0, confidence=0.98),
        Box("Nutrition", x=84.0, y=183.0, confidence=0.99),
        Box("15%", x=262.0, y=192.0, confidence=0.99),
        Box("Total Fat 12g", x=168.0, y=192.0, confidence=0.99),
        Box("Total Carbohydrate 32g", x=322.0, y=192.0, confidence=0.99),
        Box("Facts", x=70.0, y=196.0, confidence=0.99),
        Box("Dietary Fiber 1g", x=312.0, y=202.0, confidence=0.99),
        Box("Saturated Fat 4.5g", x=180.0, y=202.0, confidence=0.99),
        Box("Total Sugars 28g", x=314.0, y=212.0, confidence=0.99),
        Box("Trans Fat 0g", x=172.0, y=212.0, confidence=0.99),
        Box("6 servings per container", x=83.0, y=213.0, confidence=0.99),
        Box("Serving size", x=70.0, y=220.0, confidence=0.99),
        Box("Cholesterol <5mg", x=176.0, y=222.0, confidence=0.99),
        Box("1 bas", x=56.0, y=228.0, confidence=0.90),
        Box("Sodium 125mg", x=170.0, y=232.0, confidence=0.99),
        Box("Protein 4g", x=298.0, y=232.0, confidence=0.99),
        Box("Calories", x=69.0, y=244.0, confidence=0.99),
        Box(
            "Vitamin D 0mog 0% • Calcium 40mg 4% • Iron 0mg 0% • Potassium 150mg 4%",
            x=266.0, y=244.0, confidence=0.95,
        ),
        Box("250", x=118.0, y=246.0, confidence=0.99),
        Box("per serving", x=67.0, y=252.0, confidence=0.99),
    )
    return OcrResult(boxes=boxes, image_width=600, image_height=325)


def test_detects_a_us_label_whose_nutrition_and_facts_split_into_separate_boxes():
    """Defect 1: no single box contains 'Nutrition Facts', the label prints
    'Amount/serving' rather than 'Amount per serving', and '% Daily Value' was
    never emitted as a box at all. Detection must still succeed."""
    assert is_us_label(_snickers_linear_label())


def test_reads_every_field_off_the_linear_two_column_label():
    reading = read_us_label(_snickers_linear_label())
    assert reading.per_serving.fat_g == pytest.approx(12.0)
    assert reading.per_serving.saturates_g == pytest.approx(4.5)
    assert reading.per_serving.carbohydrate_g == pytest.approx(32.0)
    assert reading.per_serving.sugars_g == pytest.approx(28.0)
    assert reading.per_serving.protein_g == pytest.approx(4.0)
    # 125 mg sodium -> 0.125 g -> x2.5 -> 0.3125 g salt
    assert reading.per_serving.salt_g == pytest.approx(0.3125)


def test_energy_reads_the_prominent_calories_figure_not_a_vitamin_milligram():
    """Defect 3: the Calories box carries no figure, and the vitamins box sits
    on the same printed line. Mutual nearest neighbour must pick '250' - the
    old rule preferred a unit-carrying figure and silently returned 0.04."""
    reading = read_us_label(_snickers_linear_label())
    assert reading.per_serving.energy_kcal == pytest.approx(250.0)


def test_serving_size_is_the_measure_box_not_the_servings_per_container_line():
    """Defect 2: 'Serving size' and '6 servings per container' share a row band,
    and the container-count line is geometrically nearer. It is a count of
    containers, never a value, so it is excluded from the figure pool."""
    reading = read_us_label(_snickers_linear_label())
    assert reading.serving_size_text == "1 bas"


def test_serving_grams_is_none_when_the_label_prints_no_gram_weight():
    """The photograph prints 'Serving size / 1 bar' with no bracketed weight.
    That is data, not an error - the app decides what a bar weighs."""
    assert read_us_label(_snickers_linear_label()).serving_grams is None


def test_a_trans_fat_zero_never_becomes_the_serving_gram_weight():
    """Defect 2's second half: the merged row used to hand '0g' to the serving
    size regex, producing a non-positive gram weight error."""
    assert read_us_label(_snickers_linear_label()).serving_grams != 0


def test_serving_grams_is_read_when_the_label_does_print_one():
    reading = read_us_label(_us_label("2 Tbsp (30g)"))
    assert reading.serving_grams == pytest.approx(30.0)
    assert reading.per_serving.energy_kcal == pytest.approx(156.0)


def test_serving_grams_is_none_for_a_count_unit_starting_with_g():
    reading = read_us_label(_us_label("5 gummies"))
    assert reading.serving_grams is None
    assert "5 gummies" in reading.serving_size_text


def test_raises_when_a_marker_resolves_to_no_figure_at_all():
    boxes = tuple(
        box for box in _us_label("2 Tbsp (30g)").boxes if not box.text.startswith("Protein")
    )
    result = OcrResult(boxes=boxes, image_width=1000, image_height=1600)
    with pytest.raises(NormalizationError, match="protein"):
        read_us_label(result)
