import json
from pathlib import Path

import pytest

from levelspoon_ocr.boxes import Box, OcrResult
from levelspoon_ocr.product_name import extract_net_weight_text, extract_product_name

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
GOLDEN_NAMES = json.loads(
    (FIXTURES / "golden" / "product-names.json").read_text("utf-8")
)


def _result(*boxes: Box) -> OcrResult:
    return OcrResult(boxes=boxes, image_width=1200, image_height=1600)


def _latin_name(result: OcrResult) -> str:
    """A pack the Cyrillic reader found nothing on."""
    return extract_product_name(result, _result())


def _recorded(photo: str, reader: str = "boxes") -> OcrResult:
    """Boxes a real engine produced for a photo (pnpm run fixtures:capture):
    "boxes" from the en reader, "cyrillic_boxes" from the Cyrillic one."""
    data = json.loads(
        (FIXTURES / "ocr-boxes" / f"{Path(photo).stem}.json").read_text("utf-8")
    )
    return OcrResult(
        boxes=tuple(Box(**box) for box in data[reader]),
        image_width=data["image_width"],
        image_height=data["image_height"],
    )


@pytest.mark.parametrize(
    "golden", GOLDEN_NAMES, ids=[entry["photo"] for entry in GOLDEN_NAMES]
)
def test_reads_brand_type_and_fat_off_a_real_package_front(golden):
    photo = golden["photo"]
    name = extract_product_name(_recorded(photo), _recorded(photo, "cyrillic_boxes"))
    assert name == golden["name"]


def test_reads_a_cyrillic_pack_in_cyrillic():
    """The en reader returns Cyrillic as Latin lookalikes: "јогурт" reads
    "jorypt". A Latin brand on the same pack stays Latin."""
    latin = _result(
        Box("bimilk", 360.0, 353.0, 1.0, height=22.0),
        Box("utoncku", 372.0, 420.0, 0.82, height=44.0),
        Box("jorypt", 365.0, 450.0, 0.94, height=29.0),
    )
    cyrillic = _result(
        Box("bimilk", 362.0, 354.0, 0.88, height=21.0),
        Box("Бuтолcки", 360.0, 420.0, 0.45, height=54.0),
        Box("jorypт", 364.0, 451.0, 0.66, height=26.0),
    )
    assert extract_product_name(latin, cyrillic) == "bimilk Битолски јогурт"


def test_keeps_a_latin_pack_whose_stylised_word_reads_as_a_cyrillic_twin():
    """Doritos' stylised N reads as П: "NACHO" becomes "ПАСНО"."""
    latin = _result(
        Box("Doritos", 600.0, 200.0, 0.99, height=80.0),
        Box("NACHO", 600.0, 300.0, 1.0, height=21.0),
        Box("CHEESE", 600.0, 340.0, 0.99, height=21.0),
    )
    cyrillic = _result(
        Box("Doritos", 600.0, 200.0, 0.99, height=80.0),
        Box("ПАСНО", 600.0, 300.0, 0.97, height=21.0),
        Box("CHEESE", 600.0, 340.0, 0.99, height=21.0),
    )
    assert extract_product_name(latin, cyrillic) == "Doritos Nacho Cheese"


def test_reads_latin_small_caps_twins_as_lowercase_cyrillic():
    """Lowercase н and к look like small-caps H and K."""
    cyrillic = _result(
        Box("Домашна", 600.0, 200.0, 0.72, height=91.0),
        Box("СлаHинa", 600.0, 300.0, 0.6, height=77.0),
    )
    assert extract_product_name(_result(), cyrillic) == "Домашна Сланина"


def test_capitalises_an_all_caps_cyrillic_word():
    cyrillic = _result(Box("HАБYKOBO", 600.0, 200.0, 0.74, height=49.0))
    assert extract_product_name(_result(), cyrillic) == "Набуково"


def test_drops_cyrillic_reads_below_the_cyrillic_confidence_floor():
    cyrillic = _result(
        Box("Домашна", 600.0, 200.0, 0.72, height=91.0),
        Box("2ена", 600.0, 300.0, 0.36, height=60.0),
    )
    assert extract_product_name(_result(), cyrillic) == "Домашна"


def test_holds_latin_words_from_the_cyrillic_reader_to_the_latin_floor():
    """Only twin letters split the Cyrillic reader's score. "kbarume" is
    script-font "квалитет" read with no Cyrillic in it."""
    cyrillic = _result(
        Box("bimilk", 600.0, 100.0, 0.88, height=21.0),
        Box("Домашна", 600.0, 200.0, 0.71, height=85.0),
        Box("kbarume", 600.0, 300.0, 0.47, height=35.0),
    )
    assert extract_product_name(_result(), cyrillic) == "bimilk Домашна"


def test_drops_a_word_still_mixing_scripts_after_repair():
    """b has no Cyrillic twin, so script-font "врвен" stays "врbеп"."""
    cyrillic = _result(
        Box("Домашна", 600.0, 200.0, 0.71, height=85.0),
        Box("врben", 600.0, 300.0, 0.46, height=26.0),
    )
    assert extract_product_name(_result(), cyrillic) == "Домашна"


@pytest.mark.parametrize(
    "noise", ["500г", "1 кг", "НОВО", "АКЦИЈА", "без шеќер", "со вкус на јагода"]
)
def test_drops_cyrillic_quantities_claims_and_slogans(noise):
    cyrillic = _result(
        Box("Имлек", 600.0, 200.0, 0.9, height=40.0),
        Box(noise, 600.0, 300.0, 0.9, height=40.0),
    )
    assert extract_product_name(_result(), cyrillic) == "Имлек"


def test_keeps_small_cyrillic_print_that_names_what_the_product_is():
    cyrillic = _result(
        Box("Бимилк", 600.0, 200.0, 0.9, height=100.0),
        Box("кисело млеко", 600.0, 600.0, 0.9, height=12.0),
    )
    assert extract_product_name(_result(), cyrillic) == "Бимилк кисело млеко"


def test_appends_a_cyrillic_fat_percentage():
    """м.м. is млечна маст, milk fat."""
    cyrillic = _result(
        Box("Имлек", 600.0, 200.0, 0.9, height=60.0),
        Box("ЈОГУРТ", 600.0, 400.0, 0.9, height=60.0),
        Box("3,2%", 560.0, 500.0, 0.9, height=50.0),
        Box("м.м.", 650.0, 510.0, 0.9, height=20.0),
    )
    assert extract_product_name(_result(), cyrillic) == "Имлек Јогурт 3,2% м.м."


def test_joins_words_top_to_bottom():
    result = _result(
        Box("Greek", 600.0, 300.0, 0.99, height=40.0),
        Box("Olympus", 600.0, 200.0, 0.99, height=40.0),
    )
    assert _latin_name(result) == "Olympus Greek"


def test_orders_words_along_a_slanted_line_left_to_right():
    """Shot at a slant, a line's right-hand word sits higher."""
    result = _result(
        Box("Domashna", 600.0, 212.0, 0.99, height=85.0),
        Box("Slanina", 1020.0, 193.0, 0.99, height=63.0),
    )
    assert _latin_name(result) == "Domashna Slanina"


def test_drops_print_far_smaller_than_the_tallest_word():
    result = _result(
        Box("Doritos", 600.0, 200.0, 0.99, height=80.0),
        Box("FLAVORED", 600.0, 400.0, 0.99, height=10.0),
    )
    assert _latin_name(result) == "Doritos"


def test_keeps_small_print_that_names_what_the_product_is():
    result = _result(
        Box("Lay's", 600.0, 200.0, 0.99, height=85.0),
        Box("POTATO CHIPS", 300.0, 800.0, 0.99, height=14.0),
    )
    assert _latin_name(result) == "Lay's Potato Chips"


def test_appends_a_fat_percentage_printed_beside_its_keyword():
    result = _result(
        Box("Bella", 600.0, 380.0, 0.99, height=48.0),
        Box("YOGHURT", 600.0, 800.0, 0.99, height=96.0),
        Box("2,8%", 550.0, 940.0, 0.99, height=124.0),
        Box("m.m", 640.0, 960.0, 0.99, height=39.0),
    )
    assert _latin_name(result) == "Bella Yoghurt 2,8% m.m"


def test_reads_a_fat_percentage_printed_in_one_line():
    result = _result(
        Box("Olympus", 600.0, 200.0, 0.99, height=40.0),
        Box("10% FAT", 600.0, 400.0, 0.99, height=40.0),
    )
    assert _latin_name(result) == "Olympus 10% fat"


def test_restores_the_percent_sign_ocr_dropped_from_a_fat_figure():
    result = _result(
        Box("Olympus", 800.0, 650.0, 0.99, height=43.0),
        Box("2", 575.0, 846.0, 0.99, height=81.0),
        Box("FAT", 577.0, 894.0, 0.99, height=26.0),
    )
    assert _latin_name(result) == "Olympus 2% fat"


def test_drops_a_percentage_no_fat_keyword_explains():
    """A milk-content claim or a discount is not the variant."""
    result = _result(
        Box("Milka", 600.0, 300.0, 0.99, height=90.0),
        Box("100% Alpenmilch", 200.0, 400.0, 0.99, height=30.0),
        Box("-30%", 900.0, 100.0, 0.99, height=40.0),
    )
    assert _latin_name(result) == "Milka"


def test_drops_a_fat_figure_in_small_print():
    """A front-of-pack reference-intake badge ("Fat 13g 19%") is not the
    variant: its figures are a share of daily intake."""
    result = _result(
        Box("Olympus", 600.0, 200.0, 0.99, height=100.0),
        Box("Fat", 100.0, 1400.0, 0.99, height=8.0),
        Box("19%", 100.0, 1410.0, 0.99, height=8.0),
    )
    assert _latin_name(result) == "Olympus"


@pytest.mark.parametrize(
    "noise",
    [
        "LOW FAT",
        "RICH IN PROTEIN",
        "NO COLORS",
        "Share size",
        "FAMILY",
        "NEW",
        "BRAND",
        "since 1922",
        "EST.1880",
        "SUGGESTED GARNISHING",
    ],
)
def test_drops_claims_promotions_and_heritage_lines(noise):
    result = _result(
        Box("HARIBO", 600.0, 200.0, 0.99, height=40.0),
        Box(noise, 600.0, 300.0, 0.99, height=40.0),
    )
    assert _latin_name(result) == "Haribo"


@pytest.mark.parametrize(
    "quantity",
    ["281g", "870mL", "355 mL", "1kr/kg", "12FL", "NET WT 5 OZ (142 g)", "(52.7g)"],
)
def test_drops_quantities_in_any_unit(quantity):
    result = _result(
        Box("HARIBO", 600.0, 200.0, 0.99, height=40.0),
        Box(quantity, 600.0, 300.0, 0.99, height=40.0),
    )
    assert _latin_name(result) == "Haribo"


@pytest.mark.parametrize("slogan", ["body and mind", "with Goodness of"])
def test_drops_slogans(slogan):
    result = _result(
        Box("RedBull", 600.0, 200.0, 0.99, height=50.0),
        Box(slogan, 600.0, 300.0, 0.99, height=40.0),
    )
    assert _latin_name(result) == "RedBull"


def test_drops_bare_numbers():
    """A calorie badge's "250" or a founding year is never part of the name."""
    result = _result(
        Box("SNICKERS", 600.0, 400.0, 0.99, height=120.0),
        Box("250", 100.0, 340.0, 0.99, height=36.0),
        Box("CALORIES", 100.0, 370.0, 0.99, height=17.0),
        Box("1938", 600.0, 100.0, 0.99, height=40.0),
    )
    assert _latin_name(result) == "Snickers"


def test_capitalises_all_caps_words_but_not_acronyms_or_mixed_case():
    result = _result(
        Box("HELLMANN'S", 600.0, 200.0, 0.99, height=40.0),
        Box("UHT", 600.0, 300.0, 0.99, height=40.0),
        Box("KitKat", 600.0, 400.0, 0.99, height=40.0),
    )
    assert _latin_name(result) == "Hellmann's UHT KitKat"


def test_drops_low_confidence_logo_artefacts():
    """'weere' is a mountain-logo artefact, dropped by rule rather than by name."""
    result = _result(
        Box("Olympus", 600.0, 200.0, 0.99, height=40.0),
        Box("weere", 300.0, 250.0, 0.42, height=40.0),
    )
    assert _latin_name(result) == "Olympus"


@pytest.mark.parametrize("fragment", ["m", "mm", "--"])
def test_drops_fragments_with_under_three_letters(fragment):
    """'mm' is the candy-shell print beside an m&m's logo."""
    result = _result(
        Box("Olympus", 600.0, 200.0, 0.99, height=40.0),
        Box(fragment, 100.0, 210.0, 0.99, height=40.0),
    )
    assert _latin_name(result) == "Olympus"


def test_returns_empty_string_when_everything_is_noise():
    assert _latin_name(_result(Box("xx", 10.0, 10.0, 0.1))) == ""


def test_extracts_the_net_weight_declaration_verbatim():
    """Verbatim, not a parsed figure: the app's own measure-parsing pipeline
    already handles unit conversion for a label's serving-size text, and
    reusing it here (rather than parsing units in ocr-service) matches that
    established split."""
    assert extract_net_weight_text(_recorded("snickers.png")) == (
        "NET WT 1.86 0Z (52.7g)"
    )


def test_returns_none_when_no_net_weight_declaration_is_present():
    assert extract_net_weight_text(_recorded("olympus-greek-2pct-front.jpg")) is None
