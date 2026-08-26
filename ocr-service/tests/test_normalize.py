import pytest

from per100_ocr.nutrition.normalize import NormalizationError, to_grams


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
