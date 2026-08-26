from per100_ocr.boxes import Box, OcrResult, cluster_columns


def test_box_is_immutable():
    box = Box(text="2,0 g", x=100.0, y=50.0, confidence=0.97)
    assert box.text == "2,0 g"
    try:
        box.text = "changed"
    except AttributeError:
        return
    raise AssertionError("Box must be frozen")


def test_ocr_result_carries_image_dimensions():
    result = OcrResult(boxes=(Box("a", 1.0, 2.0, 0.9),), image_width=1200, image_height=1600)
    assert result.image_width == 1200
    assert len(result.boxes) == 1


def _box(text: str, x: float, y: float) -> Box:
    return Box(text=text, x=x, y=y, confidence=0.95)


def test_splits_labels_and_values_into_two_columns():
    boxes = (
        _box("Masti", 200.0, 100.0),
        _box("2,0 g", 900.0, 100.0),
        _box("Proteini", 200.0, 200.0),
        _box("9,0 g", 900.0, 200.0),
    )
    columns = cluster_columns(boxes, image_width=1000)
    assert len(columns) == 2
    assert [box.text for box in columns[0]] == ["Masti", "Proteini"]
    assert [box.text for box in columns[1]] == ["2,0 g", "9,0 g"]


def test_scales_with_image_width_rather_than_absolute_pixels():
    """Same layout at half resolution must cluster identically."""
    boxes = (
        _box("Masti", 100.0, 50.0),
        _box("2,0 g", 450.0, 50.0),
    )
    columns = cluster_columns(boxes, image_width=500)
    assert len(columns) == 2


def test_boxes_within_the_gap_stay_in_one_column():
    boxes = (_box("Energija", 200.0, 100.0), _box("/ Energy", 230.0, 100.0))
    columns = cluster_columns(boxes, image_width=1000)
    assert len(columns) == 1


def test_returns_no_columns_for_no_boxes():
    assert cluster_columns((), image_width=1000) == ()
