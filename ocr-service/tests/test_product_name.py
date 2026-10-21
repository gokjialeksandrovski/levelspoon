from levelspoon_ocr.boxes import Box, OcrResult
from levelspoon_ocr.product_name import extract_net_weight_text, extract_product_name


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


def _snickers_front() -> OcrResult:
    """Boxes captured from a real photographed Snickers wrapper front
    (800x800px) via POST /debug/boxes - the photo that produced the
    reported extra text ("250 CALORIES PER PACK SNICKERS NET WT 1.86 OZ
    (52.7g) BAR")."""
    boxes = (
        Box("250", 103.0, 344.0, 1.000),
        Box("SNICKERS", 334.5, 397.0, 1.000),
        Box("CALORIES", 104.0, 367.5, 0.998),
        Box("PER PACK", 103.5, 378.5, 0.996),
        Box("NET WT 1.86 0Z (52.7g)", 178.0, 464.0, 0.978),
        Box("BAR", 535.5, 476.0, 0.886),
    )
    return OcrResult(boxes=boxes, image_width=800, image_height=800)


def test_reads_the_brand_and_product_type_off_a_real_wrapper_front():
    """Defect: the calorie badge and net-weight declaration used to join
    straight into the name. "SNICKERS" must survive alongside "BAR" (a
    genuine product-type word, not noise), with nothing else."""
    assert extract_product_name(_snickers_front()) == "SNICKERS BAR"


def test_drops_a_net_weight_declaration():
    result = _result(
        Box("OLYMPUS", 600.0, 200.0, 0.99),
        Box("NET WT 1.86 OZ (52.7g)", 600.0, 400.0, 0.98),
    )
    assert extract_product_name(result) == "OLYMPUS"


def test_drops_a_calorie_declaration_and_its_per_pack_qualifier():
    result = _result(
        Box("OLYMPUS", 600.0, 200.0, 0.99),
        Box("CALORIES", 600.0, 400.0, 0.98),
        Box("PER PACK", 600.0, 420.0, 0.97),
    )
    assert extract_product_name(result) == "OLYMPUS"


def test_drops_a_bare_calorie_figure_nearest_a_calories_marker():
    """The figure carries no marker text of its own - "250" is only
    identifiable as a calorie declaration by sitting right next to the
    "CALORIES" badge, the same way the linear US label's figures are
    identified by proximity rather than content."""
    result = _result(
        Box("OLYMPUS", 900.0, 200.0, 0.99),
        Box("CALORIES", 100.0, 400.0, 0.98),
        Box("250", 101.0, 420.0, 0.99),
    )
    assert extract_product_name(result) == "OLYMPUS"


def test_keeps_a_bare_number_when_no_calorie_marker_is_present():
    """A bare number with no calorie declaration anywhere on the page is
    never guessed at - e.g. a variant figure OCR failed to attach a '%' to."""
    result = _result(
        Box("OLYMPUS", 600.0, 200.0, 0.99),
        Box("10", 600.0, 220.0, 0.95),
    )
    assert "10" in extract_product_name(result)


def test_keeps_a_bare_number_that_is_not_the_calorie_markers_nearest_box():
    """Two unrelated bare figures on the same page - only the one genuinely
    nearest the calorie marker is dropped, not every bare number on sight."""
    result = _result(
        Box("OLYMPUS", 900.0, 900.0, 0.99),
        Box("CALORIES", 100.0, 100.0, 0.98),
        Box("250", 101.0, 120.0, 0.99),
        Box("10", 901.0, 920.0, 0.95),
    )
    name = extract_product_name(result)
    assert "250" not in name
    assert "10" in name


def _olympus_front() -> OcrResult:
    """Boxes captured from the repo's existing real Olympus front photo
    (1220x1627px) via POST /debug/boxes - regression coverage proving the
    declared-quantity/calorie-figure filtering leaves an unrelated real
    photo untouched (this label prints no net-weight or calorie
    declaration at all)."""
    boxes = (
        Box("OLYMPUS", 811.5, 655.5, 0.999960720539093),
        Box("", 720.0, 730.5, 0.0),
        Box("Greek", 815.5, 824.5, 0.9999812841415405),
        Box("2", 575.5, 846.5, 0.9995612502098083),
        Box("FAT", 577.5, 894.0, 0.9998025894165039),
        Box("RECIPE YOGURT", 817.5, 883.5, 0.9998842477798462),
        Box("LOW FAT", 816.0, 955.5, 0.9782427549362183),
        Box("STRAINED", 615.0, 1006.0, 0.9998885989189148),
        Box("RICH IN PROTEIN", 822.0, 1016.5, 0.9834743738174438),
    )
    return OcrResult(boxes=boxes, image_width=1220, image_height=1627)


def test_a_label_with_no_declared_quantity_is_unaffected():
    assert extract_product_name(_olympus_front()) == (
        "OLYMPUS Greek RECIPE YOGURT FAT LOW FAT STRAINED RICH IN PROTEIN"
    )


def test_extracts_the_net_weight_declaration_verbatim():
    """Verbatim, not a parsed figure: the app's own measure-parsing pipeline
    already handles unit conversion for a label's serving-size text, and
    reusing it here (rather than parsing units in ocr-service) matches that
    established split."""
    assert extract_net_weight_text(_snickers_front()) == "NET WT 1.86 0Z (52.7g)"


def test_returns_none_when_no_net_weight_declaration_is_present():
    assert extract_net_weight_text(_olympus_front()) is None
