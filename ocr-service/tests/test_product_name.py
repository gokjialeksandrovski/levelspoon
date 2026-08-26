from per100_ocr.boxes import Box, OcrResult
from per100_ocr.product_name import extract_product_name


def _result(*boxes: Box) -> OcrResult:
    return OcrResult(boxes=boxes, image_width=1200, image_height=1600)


def test_joins_detections_top_to_bottom():
    result = _result(
        Box("Greek", 600.0, 300.0, 0.99),
        Box("OLYMPUS", 600.0, 200.0, 0.99),
    )
    assert extract_product_name(result) == "OLYMPUS Greek"


def test_drops_low_confidence_logo_artefacts():
    """'weere' is the mountain-logo artefact the spike hardcoded by name."""
    result = _result(
        Box("OLYMPUS", 600.0, 200.0, 0.99),
        Box("weere", 300.0, 250.0, 0.42),
    )
    assert "weere" not in extract_product_name(result)


def test_keeps_percentage_variant_markers():
    """'2%' must survive - the margin rule needs it to tell variants apart."""
    result = _result(
        Box("OLYMPUS", 600.0, 200.0, 0.99),
        Box("2%", 200.0, 300.0, 0.95),
        Box("FAT", 200.0, 340.0, 0.95),
    )
    name = extract_product_name(result)
    assert "2%" in name


def test_drops_single_character_fragments():
    result = _result(Box("OLYMPUS", 600.0, 200.0, 0.99), Box("m", 100.0, 210.0, 0.9))
    assert extract_product_name(result) == "OLYMPUS"


def test_drops_boxes_with_no_alphanumeric_content():
    result = _result(Box("OLYMPUS", 600.0, 200.0, 0.99), Box("--", 100.0, 210.0, 0.9))
    assert extract_product_name(result) == "OLYMPUS"


def test_returns_empty_string_when_everything_is_noise():
    assert extract_product_name(_result(Box("xx", 10.0, 10.0, 0.1))) == ""
