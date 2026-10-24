import pytest

from levelspoon_ocr.boxes import Box
from levelspoon_ocr.nutrition.normalize import (
    NormalizationError,
    split_energy_row,
    to_grams,
)


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
        # A letter touching the figure must not cut its decimals off.
        ("0,60г", 0.6),
        ("2,82gr", 2.82),
        ("8,23r,", 8.23),
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
    """The easy case: '295kJ/70 Kcal' arrives as a single detection."""
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


def test_reports_a_missing_kcal_figure_as_none_and_still_consumes_the_kj_box():
    boxes = (_box("295 kJ", 100.0), _box("2,0 g", 200.0))
    kcal, kj, remaining = split_energy_row(boxes)
    assert (kcal, kj) == (None, 295.0)
    assert [box.text for box in remaining] == ["2,0 g"]


def test_reports_no_energy_row_as_none_and_consumes_nothing():
    boxes = (_box("2,0 g", 200.0),)
    assert split_energy_row(boxes) == (None, None, boxes)


def test_reads_a_unitless_energy_pair_whose_units_sit_in_the_row_label():
    """Real bag label: "Energy value (kJ/kcal)" beside a bare "112.71/26.96"."""
    boxes = (_box("112.71/26.96", 100.0), _box("0.17", 200.0))
    kcal, kj, remaining = split_energy_row(boxes)
    assert (kcal, kj) == (26.96, 112.71)
    assert [box.text for box in remaining] == ["0.17"]


def test_a_bare_pair_off_the_kj_per_kcal_ratio_is_not_energy():
    boxes = (_box("1/2", 100.0), _box("0.17", 200.0))
    assert split_energy_row(boxes) == (None, None, boxes)
