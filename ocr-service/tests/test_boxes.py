from per100_ocr.boxes import Box, OcrResult


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
