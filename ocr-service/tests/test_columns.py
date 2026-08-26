import pytest

from per100_ocr.boxes import Box, OcrResult
from per100_ocr.nutrition.columns import ColumnDetectionError, find_per_100g_values


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
