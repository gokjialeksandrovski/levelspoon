import pytest
from fastapi.testclient import TestClient

from levelspoon_ocr.boxes import Box, OcrResult, UnreadablePhotoError
from levelspoon_ocr.main import app, get_engine


class StubEngine:
    """Stands in for PaddleOCR so the contract can be tested without a model."""

    model_loaded = True

    def __init__(self, result: OcrResult) -> None:
        self._result = result

    def read(self, _image_bytes: bytes) -> OcrResult:
        return self._result


def _nutrition_result() -> OcrResult:
    texts = ["295kJ/70 Kcal", "2,0 g", "1,2 g", "4,0 g", "4,0 g", "9,0 g", "0,18 g"]
    boxes = [Box("100 g", 900.0, 100.0, 0.95)]
    boxes += [Box(text, 900.0, 200.0 + i * 100.0, 0.95) for i, text in enumerate(texts)]
    return OcrResult(boxes=tuple(boxes), image_width=1000, image_height=1400)


def _us_label_result_without_grams() -> OcrResult:
    texts = [
        "Nutrition Facts",
        "Serving Size 2 Tablespoon",
        "Calories 230",
        "Total Fat 8g",
        "Saturated Fat 1g",
        "Sodium 180mg",
        "Total Carbohydrate 37g",
        "Total Sugars 9g",
        "Protein 3g",
    ]
    boxes = [Box(text, 100.0, 100.0 + i * 50.0, 0.95) for i, text in enumerate(texts)]
    return OcrResult(boxes=tuple(boxes), image_width=1000, image_height=1600)


@pytest.fixture
def client_with(request):
    def _build(result: OcrResult) -> TestClient:
        app.dependency_overrides[get_engine] = lambda: StubEngine(result)
        request.addfinalizer(app.dependency_overrides.clear)
        return TestClient(app)

    return _build


def test_health_reports_model_state(client_with):
    response = client_with(_nutrition_result()).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "model_loaded": True}


def test_nutrition_endpoint_returns_the_spec_contract(client_with):
    client = client_with(_nutrition_result())
    response = client.post(
        "/ocr/nutrition-table", files={"image": ("x.jpg", b"bytes", "image/jpeg")}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["per_100g"]["energy_kcal"] == 70.0
    assert body["per_100g"]["salt_g"] == 0.18
    assert body["flags"] == []
    assert set(body["per_100g"]) == {
        "energy_kcal",
        "fat_g",
        "saturates_g",
        "carbohydrate_g",
        "sugars_g",
        "protein_g",
        "salt_g",
        "fibre_g",
    }


def test_product_name_endpoint_returns_text(client_with):
    result = OcrResult(
        boxes=(Box("OLYMPUS", 600.0, 200.0, 0.99), Box("Greek", 600.0, 300.0, 0.99)),
        image_width=1200,
        image_height=1600,
    )
    response = client_with(result).post(
        "/ocr/product-name", files={"image": ("x.jpg", b"bytes", "image/jpeg")}
    )
    assert response.json() == {"text": "OLYMPUS Greek", "net_weight_text": None}


def test_product_name_endpoint_reports_a_printed_net_weight(client_with):
    result = OcrResult(
        boxes=(
            Box("SNICKERS", 334.5, 397.0, 1.0),
            Box("NET WT 1.86 0Z (52.7g)", 178.0, 464.0, 0.978),
        ),
        image_width=800,
        image_height=800,
    )
    response = client_with(result).post(
        "/ocr/product-name", files={"image": ("x.jpg", b"bytes", "image/jpeg")}
    )
    assert response.json() == {
        "text": "SNICKERS",
        "net_weight_text": "NET WT 1.86 0Z (52.7g)",
    }


def test_unreadable_nutrition_table_returns_422_not_zeroes(client_with):
    """No per-100g header: fail loudly rather than invent values."""
    blank = OcrResult(
        boxes=(Box("Masti", 200.0, 200.0, 0.9),), image_width=1000, image_height=1400
    )
    response = client_with(blank).post(
        "/ocr/nutrition-table", files={"image": ("x.jpg", b"bytes", "image/jpeg")}
    )
    assert response.status_code == 422
    assert "detail" in response.json()


def test_missing_value_serialises_as_null_not_nan(client_with):
    """A short table leaves salt unread; the response must stay valid JSON.

    Python's json module emits a bare `NaN` literal, which JSON.parse rejects -
    so an unsanitised nan would break the M2 client at the confirm step.
    """
    texts = ["295kJ/70 Kcal", "2,0 g", "1,2 g", "4,0 g", "4,0 g", "9,0 g"]
    boxes = [Box("100 g", 900.0, 100.0, 0.95)]
    boxes += [Box(text, 900.0, 200.0 + i * 100.0, 0.95) for i, text in enumerate(texts)]
    result = OcrResult(boxes=tuple(boxes), image_width=1000, image_height=1400)

    response = client_with(result).post(
        "/ocr/nutrition-table", files={"image": ("x.jpg", b"bytes", "image/jpeg")}
    )
    assert "NaN" not in response.text
    assert response.json()["per_100g"]["salt_g"] is None
    assert "salt_g" in response.json()["flags"]


def test_validate_endpoint_returns_no_flags_for_golden_values():
    client = TestClient(app)
    response = client.post(
        "/validate",
        json={
            "values": {
                "energy_kcal": 70.0,
                "fat_g": 2.0,
                "saturates_g": 1.2,
                "carbohydrate_g": 4.0,
                "sugars_g": 4.0,
                "protein_g": 9.0,
                "salt_g": 0.18,
            },
            "energy_kj": 295.0,
        },
    )
    assert response.status_code == 200
    assert response.json() == {"flags": []}


def test_validate_endpoint_flags_saturates_above_fat():
    client = TestClient(app)
    response = client.post(
        "/validate",
        json={
            "values": {
                "energy_kcal": 70.0,
                "fat_g": 2.0,
                "saturates_g": 5.0,
                "carbohydrate_g": 4.0,
                "sugars_g": 4.0,
                "protein_g": 9.0,
                "salt_g": 0.18,
            },
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "saturates_g" in body["flags"]
    assert "fat_g" in body["flags"]


def test_validate_endpoint_rejects_a_missing_field():
    client = TestClient(app)
    response = client.post("/validate", json={"values": {"energy_kcal": 70.0}})
    assert response.status_code == 422


def test_eu_label_response_carries_per_100g_and_null_serving_fields(client_with):
    client = client_with(_nutrition_result())
    response = client.post(
        "/ocr/nutrition-table", files={"image": ("x.jpg", b"bytes", "image/jpeg")}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["format"] == "eu"
    assert body["per_100g"]["energy_kcal"] == 70.0
    assert body["per_serving"] is None
    assert body["serving_size_text"] is None
    assert body["serving_grams"] is None
    assert body["servings_per_container"] is None


def test_us_label_response_carries_the_servings_per_container_count(client_with):
    texts = [
        "Nutrition Facts",
        "48 servings per container",
        "Serving Size 2 Tablespoon",
        "Calories 230",
        "Total Fat 8g",
        "Saturated Fat 1g",
        "Sodium 180mg",
        "Total Carbohydrate 37g",
        "Total Sugars 9g",
        "Protein 3g",
    ]
    boxes = tuple(
        Box(text, 100.0, 100.0 + i * 50.0, 0.95) for i, text in enumerate(texts)
    )
    result = OcrResult(boxes=boxes, image_width=1000, image_height=1600)
    response = client_with(result).post(
        "/ocr/nutrition-table", files={"image": ("x.jpg", b"bytes", "image/jpeg")}
    )
    assert response.json()["servings_per_container"] == 48.0


def test_us_label_without_a_gram_weight_returns_200_with_a_null_serving_grams(
    client_with,
):
    """A serving with no printed weight is ordinary data, not a failure - a
    422 here surfaces in the app as OcrServiceError."""
    client = client_with(_us_label_result_without_grams())
    response = client.post(
        "/ocr/nutrition-table", files={"image": ("x.jpg", b"bytes", "image/jpeg")}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["format"] == "us"
    assert body["per_100g"] is None
    assert body["per_serving"]["energy_kcal"] == 230.0
    assert body["serving_grams"] is None
    assert "2 Tablespoon" in body["serving_size_text"]


def test_us_label_with_a_printed_gram_weight_reports_it(client_with):
    texts = [
        "Nutrition Facts",
        "Serving Size 2 Tbsp (30g)",
        "Calories 230",
        "Total Fat 8g",
        "Saturated Fat 1g",
        "Sodium 180mg",
        "Total Carbohydrate 37g",
        "Total Sugars 9g",
        "Protein 3g",
    ]
    boxes = tuple(
        Box(text, 100.0, 100.0 + i * 50.0, 0.95) for i, text in enumerate(texts)
    )
    result = OcrResult(boxes=boxes, image_width=1000, image_height=1600)
    response = client_with(result).post(
        "/ocr/nutrition-table", files={"image": ("x.jpg", b"bytes", "image/jpeg")}
    )
    body = response.json()
    assert body["serving_grams"] == 30.0
    assert body["per_serving"]["energy_kcal"] == 230.0


def test_an_unreadable_photo_still_returns_422(client_with):
    blank = OcrResult(
        boxes=(Box("Masti", 200.0, 200.0, 0.9),), image_width=1000, image_height=1400
    )
    response = client_with(blank).post(
        "/ocr/nutrition-table", files={"image": ("x.jpg", b"bytes", "image/jpeg")}
    )
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], str)


class UndecodableEngine:
    model_loaded = True

    def read(self, _image_bytes: bytes) -> OcrResult:
        raise UnreadablePhotoError("Not a decodable image (5 bytes)")


@pytest.mark.parametrize(
    "endpoint", ["/ocr/nutrition-table", "/ocr/product-name", "/debug/boxes"]
)
def test_an_undecodable_upload_is_415_not_500(request, endpoint):
    """A HEIC or corrupt file: retaking the photo would fail the same way, so
    it must not look like an unreadable label (422)."""
    app.dependency_overrides[get_engine] = UndecodableEngine
    request.addfinalizer(app.dependency_overrides.clear)
    response = TestClient(app).post(
        endpoint, files={"image": ("x.heic", b"bytes", "image/heic")}
    )
    assert response.status_code == 415
    assert "decodable" in response.json()["detail"]
