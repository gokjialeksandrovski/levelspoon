import math

import pytest

from levelspoon_ocr.boxes import Box, OcrResult
from levelspoon_ocr.nutrition.columns import ColumnDetectionError
from levelspoon_ocr.nutrition.parse import parse_nutrition
from levelspoon_ocr.nutrition.reading import LabelFormat


def _box(text: str, y: float, x: float = 900.0) -> Box:
    return Box(text=text, x=x, y=y, confidence=0.95)


def _label(*value_texts: str) -> OcrResult:
    boxes = [_box("100 g", 100.0)]
    boxes += [
        _box(text, 200.0 + index * 100.0) for index, text in enumerate(value_texts)
    ]
    boxes.append(_box("Masti", 200.0, x=100.0))
    return OcrResult(boxes=tuple(boxes), image_width=1000, image_height=1400)


def test_parses_the_golden_label():
    result = _label(
        "295kJ/70 Kcal", "2,0 g", "1,2 g", "4,0 g", "4,0 g", "9,0 g", "0,18 g"
    )
    reading = parse_nutrition(result)
    assert reading.per_100g.energy_kcal == 70.0
    assert reading.per_100g.fat_g == 2.0
    assert reading.per_100g.salt_g == 0.18
    assert reading.energy_kj == 295.0
    assert reading.flags == ()
    assert reading.basis_unit == "g"


def test_parses_a_label_with_energy_split_across_two_boxes():
    """Eight numeric boxes must still map onto seven logical fields."""
    result = _label(
        "295 kJ", "70 kcal", "2,0 g", "1,2 g", "4,0 g", "4,0 g", "9,0 g", "0,18 g"
    )
    reading = parse_nutrition(result)
    assert reading.per_100g.fat_g == 2.0
    assert reading.per_100g.protein_g == 9.0
    assert reading.flags == ()


def test_recovers_a_dropped_decimal_separator():
    result = _label(
        "295kJ/70 Kcal", "20g", "1,2 g", "4,0 g", "4,0 g", "9,0 g", "0,18 g"
    )
    assert parse_nutrition(result).per_100g.fat_g == 2.0


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
    result = _label(
        "295kJ/70 Kcal", "2,0 g", "od kojih", "4,0 g", "4,0 g", "9,0 g", "0,18 g"
    )
    reading = parse_nutrition(result)
    assert math.isnan(reading.per_100g.saturates_g)
    assert "saturates_g" in reading.flags


def _bella_farm_yoghurt_label() -> OcrResult:
    """Boxes captured from a real photographed multilingual EU label
    (1220x1627px) via POST /debug/boxes - the photo that produced the
    reported 422. The four-language header phrase prints aligned with the
    row descriptions, not the numeric column, and OCR badly garbles the
    low-confidence saturates figure ("1,8g" read as " e  s ,8"), landing it
    in the description column too - both defects on the same real photo."""
    boxes = (
        Box("100 g   ", 469.5, 394.5, 0.9415),
        Box("100 ge prodhimit permban mesatarisht", 471.0, 418.5, 0.9741),
        Box("    100 /", 470.0, 442.5, 0.8941),
        Box("Non maonspe 100g", 471.0, 467.0, 0.6927),
        Box("   1", 419.5, 501.0, 0.8534),
        Box("Vlera e energjise nÃ« 100 g", 405.5, 521.0, 0.8707),
        Box("   T00", 414.0, 539.0, 0.7546),
        Box("Energy value in 100 g/", 395.5, 558.0, 0.9617),
        Box("233kJ/56kcal", 589.5, 552.0, 0.9868),
        Box("URT", 230.0, 651.5, 0.9027),
        Box("/ndr//Fat", 421.5, 591.5, 0.8506),
        Box("2,8g", 610.5, 587.0, 0.9978),
        Box("ouk sactei mact dngopur prei yre te ngopora", 477.0, 620.0, 0.5522),
        Box("YO", 753.5, 702.5, 0.9991),
        Box(" e  s ,8", 480.5, 637.5, 0.6239),
        Box("/Karbohidrate/", 418.5, 681.5, 0.7697),
        Box("/abohydrate", 419.5, 700.0, 0.7848),
        Box("4,6g", 612.0, 699.0, 0.9986),
        Box("oonwekep /nga te cilat shegerna", 443.0, 734.5, 0.8101),
        Box("or eouto zaxapn /of which sugars", 432.0, 752.5, 0.8021),
        Box("4,6g", 612.5, 746.5, 0.9002),
        Box("/Proteina/", 403.5, 790.0, 0.9048),
        Box("/Proteins", 396.5, 808.0, 0.9694),
        Box("3g", 616.5, 801.0, 0.9995),
        Box("0/", 239.0, 838.0, 0.8683),
        Box("*Con/Kripe/Con/Salt", 411.0, 842.5, 0.9852),
        Box("0,115g", 606.0, 838.5, 0.9993),
        Box("70", 251.0, 881.0, 0.8790),
        Box("Qal", 488.5, 868.5, 0.4837),
        Box("  / ", 486.0, 885.5, 0.6668),
        Box("naturally presentsodium.", 412.0, 905.5, 0.9214),
        Box("m.m", 258.5, 947.5, 0.8920),
        Box("Kanm/Kalcium/", 404.0, 935.5, 0.9119),
        Box("120mg", 612.0, 931.0, 0.9999),
        Box("Kn/Calcium", 401.0, 953.5, 0.9613),
        Box("15%///", 564.5, 947.5, 0.8579),
        Box("(8400 kJ)", 606.0, 980.5, 0.8817),
        Box("2000 kcal", 604.0, 996.0, 0.9416),
        Box("5310153010098", 488.5, 1337.5, 0.9960),
    )
    return OcrResult(boxes=boxes, image_width=1220, image_height=1627)


def test_reads_a_multilingual_label_whose_header_sits_with_the_row_descriptions():
    """Anchoring column selection on the header, not the energy figure,
    would 422 here with "No energy row found"."""
    reading = parse_nutrition(_bella_farm_yoghurt_label())
    assert reading.per_100g.energy_kcal == pytest.approx(56.0)
    assert reading.energy_kj == pytest.approx(233.0)
    assert reading.per_100g.fat_g == pytest.approx(2.8)
    assert reading.per_100g.carbohydrate_g == pytest.approx(4.6)
    assert reading.per_100g.sugars_g == pytest.approx(4.6)
    assert reading.per_100g.protein_g == pytest.approx(3.0)
    assert reading.per_100g.salt_g == pytest.approx(0.115)


def test_flags_the_reclaimed_saturates_figure_it_could_not_cleanly_read():
    """The saturates box is so garbled (" e  s ,8", missing its leading "1")
    that the reclaimed reading (8.0) is nutritionally impossible - more than
    the label's own fat figure. The existing subset-of-fat plausibility
    rule must still catch it and flag it for the user, not accept it
    silently just because a value now exists in the right slot."""
    reading = parse_nutrition(_bella_farm_yoghurt_label())
    assert "saturates_g" in reading.flags
    assert "fat_g" in reading.flags


def _us_label_result() -> OcrResult:
    texts = [
        "Nutrition Facts",
        "Serving Size 2 Tbsp (30g)",
        "Calories 230",
        "Total Fat 8g",
        "Saturated Fat 1g",
        "Sodium 180mg",
        "Total Carbohydrate 37g",
        "Total Sugars 9g",
        "Protein 3g",
    ]
    boxes = [Box(text, 100.0, 100.0 + i * 50.0, 0.95) for i, text in enumerate(texts)]
    return OcrResult(boxes=tuple(boxes), image_width=1000, image_height=1600)


def test_dispatches_a_us_label_to_the_us_parser_when_no_100g_header_exists():
    reading = parse_nutrition(_us_label_result())
    assert reading.label_format is LabelFormat.US
    assert reading.per_100g is None
    assert reading.per_serving.energy_kcal == pytest.approx(230.0)
    assert reading.serving_grams == pytest.approx(30.0)


def test_a_us_reading_carries_the_servings_per_container_count():
    result = _us_label_result()
    boxes = result.boxes + (Box("15 servings per container", 100.0, 75.0, 0.95),)
    reading = parse_nutrition(
        OcrResult(boxes=boxes, image_width=1000, image_height=1600)
    )
    assert reading.servings_per_container == pytest.approx(15.0)


def test_an_eu_reading_has_no_servings_per_container():
    result = _label(
        "295kJ/70 Kcal", "2,0 g", "1,2 g", "4,0 g", "4,0 g", "9,0 g", "0,18 g"
    )
    assert parse_nutrition(result).servings_per_container is None


def test_a_us_reading_carries_no_flags_because_validation_happens_after_scaling():
    """validate()'s rules are per-100g rules; per-serving figures would trip
    them spuriously. The caller validates once it has scaled."""
    assert parse_nutrition(_us_label_result()).flags == ()


def test_an_unreadable_photo_still_raises_column_detection_error():
    """No EU header and no US markers: still a loud failure."""
    result = OcrResult(
        boxes=(Box("Masti", 200.0, 200.0, 0.9),), image_width=1000, image_height=1400
    )
    with pytest.raises(ColumnDetectionError):
        parse_nutrition(result)


def test_seven_value_rows_read_fibre_and_keep_protein_and_salt():
    """EU order prints fibre between sugars and protein (Reg 1169/2011).

    Unhandled, the extra row would shift protein into salt_g and drop
    salt - a silent one-field shift, the same class split_energy_row exists
    to prevent.
    """
    result = _label(
        "1046kJ/250 Kcal", "10 g", "4 g", "30 g", "12 g", "6 g", "8 g", "1,2 g"
    )
    reading = parse_nutrition(result)
    assert reading.per_100g.fibre_g == 6.0
    assert reading.per_100g.protein_g == 8.0
    assert reading.per_100g.salt_g == 1.2


def test_six_value_rows_leave_fibre_unknown():
    result = _label("1046kJ/250 Kcal", "10 g", "4 g", "30 g", "12 g", "8 g", "1,2 g")
    reading = parse_nutrition(result)
    assert reading.per_100g.fibre_g is None
    assert reading.per_100g.protein_g == 8.0
    assert reading.per_100g.salt_g == 1.2


def test_more_than_seven_rows_keep_todays_mapping():
    """Polyols or starch beside fibre put the count past seven, and nothing
    in a count says which optional row ran. Guessing would invent a mapping;
    this keeps the six-row order.
    """
    result = _label(
        "1046kJ/250 Kcal", "10 g", "4 g", "30 g", "12 g", "6 g", "3 g", "8 g", "1,2 g"
    )
    reading = parse_nutrition(result)
    assert reading.per_100g.fibre_g is None


def test_reads_a_per_100ml_label_and_reports_its_basis():
    boxes = [_box("Average nutritional values per 100 ml", 100.0, x=100.0)]
    boxes += [
        _box(text, 200.0 + index * 100.0)
        for index, text in enumerate(
            ("192kJ/46 kcal", "1,5 g", "0,9 g", "4,8 g", "4,8 g", "3,2 g", "0,1 g")
        )
    ]
    reading = parse_nutrition(
        OcrResult(boxes=tuple(boxes), image_width=1000, image_height=1400)
    )
    assert reading.basis_unit == "ml"
    assert reading.per_100g.fat_g == 1.5
    assert reading.per_100g.salt_g == 0.1
