import pytest

from per100_ocr.boxes import Box
from per100_ocr.nutrition.normalize import NormalizationError, split_energy_row, to_grams


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("2,0 g", 2.0),
        ("2.0g", 2.0),
        ("  9,0  g ", 9.0),
        ("0,18 g", 0.18),
        ("72 g", 72.0),
        ("180 mg", 0.18),
        ("180mg", 0.18),
    ],
)
def test_converts_label_values_to_grams(raw, expected):
    assert to_grams(raw) == pytest.approx(expected)


@pytest.mark.parametrize("raw", ["", "g", "od kojih", "-"])
def test_raises_when_no_number_is_present(raw):
    with pytest.raises(NormalizationError):
        to_grams(raw)


def test_never_returns_zero_for_unreadable_input():
    """A silent 0 looks like real data (spec §4.4)."""
    with pytest.raises(NormalizationError):
        to_grams("???")


def _box(text: str, y: float) -> Box:
    return Box(text=text, x=900.0, y=y, confidence=0.95)


def test_reads_energy_merged_into_one_box():
    """The spike's lucky case: '295kJ/70 Kcal' arrives as a single detection."""
    boxes = (_box("295kJ/70 Kcal", 100.0), _box("2,0 g", 200.0))
    kcal, kj, remaining = split_energy_row(boxes)
    assert (kcal, kj) == (70.0, 295.0)
    assert [box.text for box in remaining] == ["2,0 g"]


def test_reads_energy_split_across_two_boxes():
    """The case that would silently shift every later field by one."""
    boxes = (_box("295 kJ", 100.0), _box("70 kcal", 140.0), _box("2,0 g", 200.0))
    kcal, kj, remaining = split_energy_row(boxes)
    assert (kcal, kj) == (70.0, 295.0)
    assert [box.text for box in remaining] == ["2,0 g"]


def test_consumes_only_the_energy_boxes():
    boxes = (
        _box("295kJ/70 Kcal", 100.0),
        _box("2,0 g", 200.0),
        _box("1,2 g", 300.0),
        _box("4,0 g", 400.0),
    )
    _, _, remaining = split_energy_row(boxes)
    assert len(remaining) == 3


def test_raises_when_kcal_figure_is_missing():
    boxes = (_box("295 kJ", 100.0), _box("2,0 g", 200.0))
    with pytest.raises(NormalizationError, match="kcal"):
        split_energy_row(boxes)


def test_raises_when_no_energy_row_is_present():
    boxes = (_box("2,0 g", 200.0),)
    with pytest.raises(NormalizationError, match="energy"):
        split_energy_row(boxes)
