import pytest

from levelspoon_ocr.boxes import Box, OcrResult
from levelspoon_ocr.nutrition.columns import ColumnDetectionError, find_per_100g_values


def _result(*boxes: Box, width: int = 1000) -> OcrResult:
    return OcrResult(boxes=boxes, image_width=width, image_height=1200)


def _box(text: str, x: float, y: float) -> Box:
    return Box(text=text, x=x, y=y, confidence=0.95)


def test_finds_values_under_the_100g_header():
    result = _result(
        _box("Masti", 200.0, 200.0),
        _box("100 g", 900.0, 100.0),
        _box("2,0 g", 900.0, 200.0),
        _box("9,0 g", 900.0, 300.0),
    )
    assert [box.text for box in find_per_100g_values(result)] == ["2,0 g", "9,0 g"]


def test_picks_the_100g_column_not_the_per_serving_column():
    """The failure the spike's positional slice could not survive."""
    result = _result(
        _box("Masti", 100.0, 200.0),
        _box("100 g", 500.0, 100.0),
        _box("2,0 g", 500.0, 200.0),
        _box("per serving", 900.0, 100.0),
        _box("5,0 g", 900.0, 200.0),
    )
    assert [box.text for box in find_per_100g_values(result)] == ["2,0 g"]


@pytest.mark.parametrize("header", ["100g", "100 g", "/100 g", "na 100g"])
def test_recognises_header_spellings(header):
    result = _result(_box(header, 900.0, 100.0), _box("2,0 g", 900.0, 200.0))
    assert len(find_per_100g_values(result)) == 1


def test_raises_when_no_header_is_found():
    """Fail loudly rather than guess which column holds per-100g values."""
    result = _result(_box("Masti", 200.0, 200.0), _box("2,0 g", 900.0, 200.0))
    with pytest.raises(ColumnDetectionError, match="per-100g header"):
        find_per_100g_values(result)


def test_anchors_on_the_energy_figure_when_the_header_sits_with_the_labels():
    """Real multilingual label defect: the header phrase can print aligned
    with the row descriptions, not the numeric column. Energy is mandatory
    on every EU label and always a value, never label text - anchoring on
    it instead of the header finds the true value column regardless."""
    result = _result(
        _box("Nutrition informations per 100g", 470.0, 100.0),
        _box("Fat", 470.0, 200.0),
        _box("233kJ/56kcal", 900.0, 150.0),
        _box("2,0 g", 900.0, 200.0),
    )
    assert [box.text for box in find_per_100g_values(result)] == ["233kJ/56kcal", "2,0 g"]


def test_reunites_a_value_ocr_mis_clustered_into_the_label_column():
    """A garbled, low-confidence detection can land geometrically closer to
    the label column than the value column it belongs to. The resulting gap
    in the value sequence must be filled, not silently skipped, or every
    field after it would shift into the wrong slot."""
    result = _result(
        _box("100 g", 900.0, 100.0),
        _box("233kJ/56kcal", 900.0, 200.0),
        _box("2,0 g", 900.0, 300.0),
        _box("1,2 g", 450.0, 400.0),  # mis-clustered: x=450, not x=900
        _box("4,0 g", 900.0, 500.0),
        _box("9,0 g", 900.0, 600.0),
        _box("0,18 g", 900.0, 700.0),
    )
    values = find_per_100g_values(result)
    assert [box.text for box in values] == ["233kJ/56kcal", "2,0 g", "1,2 g", "4,0 g", "9,0 g", "0,18 g"]


def test_does_not_reclaim_a_label_fragment_that_happens_to_sit_in_the_gap():
    """Only a digit-bearing box counts - a garbled label-text fragment
    sitting in the same vertical gap must never be mistaken for a value."""
    result = _result(
        _box("100 g", 900.0, 100.0),
        _box("233kJ/56kcal", 900.0, 200.0),
        _box("2,0 g", 900.0, 300.0),
        _box("od kojih zasiceni", 450.0, 400.0),  # no digits - a label fragment
        _box("4,0 g", 900.0, 500.0),
        _box("9,0 g", 900.0, 600.0),
        _box("0,18 g", 900.0, 700.0),
    )
    values = find_per_100g_values(result)
    assert [box.text for box in values] == ["233kJ/56kcal", "2,0 g", "4,0 g", "9,0 g", "0,18 g"]
