"""Tier-4 gate: the real service reading the real photographs (spec §9.5).

Local only - excluded from CI by the 'real' marker, since two OCR models (~230MB) and
~10s per photo buy little on every push. Required green before any deploy.

Requires: pnpm run ocr:up
"""

import json
from pathlib import Path

import httpx
import pytest

SERVICE_URL = "http://localhost:8000"
REQUEST_TIMEOUT_SECONDS = 120.0
GOLDEN_NAMES = json.loads(
    (
        Path(__file__).resolve().parents[2]
        / "fixtures"
        / "golden"
        / "product-names.json"
    ).read_text("utf-8")
)

pytestmark = pytest.mark.real


@pytest.fixture(scope="module")
def golden(fixtures_dir):
    return json.loads(
        (fixtures_dir / "golden" / "olympus-greek-2pct.json").read_text("utf-8")
    )


def _post(endpoint: str, photo_path):
    with photo_path.open("rb") as handle:
        response = httpx.post(
            f"{SERVICE_URL}{endpoint}",
            files={"image": (photo_path.name, handle, "image/jpeg")},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    response.raise_for_status()
    return response.json()


def test_service_is_healthy_with_its_model_loaded():
    health = httpx.get(f"{SERVICE_URL}/health", timeout=REQUEST_TIMEOUT_SECONDS).json()
    assert health["model_loaded"] is True


def test_reads_every_nutrition_value_from_the_real_label(fixtures_dir, golden):
    body = _post(
        "/ocr/nutrition-table",
        fixtures_dir / "photos" / "olympus-greek-2pct-nutrition.jpg",
    )
    expected = golden["nutrition_per_100g"]

    for field in (
        "energy_kcal",
        "fat_g",
        "saturates_g",
        "carbohydrate_g",
        "sugars_g",
        "protein_g",
        "salt_g",
    ):
        assert body["per_100g"][field] == pytest.approx(expected[field]), (
            f"{field}: read {body['per_100g'][field]}, expected {expected[field]}"
        )


def test_real_label_raises_no_validation_flags(fixtures_dir, golden):
    """These values satisfy every §4.4 rule, so any flag is a parser defect."""
    body = _post(
        "/ocr/nutrition-table",
        fixtures_dir / "photos" / "olympus-greek-2pct-nutrition.jpg",
    )
    assert body["flags"] == golden["expected_flags"]


# Two labels that once 422'd: a value cell holding a bare "112.71/26.96", and
# a declaration printed as running text with no table at all.
@pytest.mark.parametrize(
    ("photo", "expected"),
    [
        (
            "broccoli-bag-nutrition.jpg",
            {
                "energy_kcal": 26.96,
                "fat_g": 0.17,
                "saturates_g": 0.08,
                "carbohydrate_g": 2.82,
                "sugars_g": 1.35,
                "protein_g": 3.44,
                "salt_g": 0.0,
            },
        ),
        (
            "kosiljak-slanina-nutrition.jpg",
            {
                "energy_kcal": 263.0,
                "fat_g": 22.0,
                "saturates_g": 8.23,
                "carbohydrate_g": 0.6,
                "sugars_g": 0.11,
                "protein_g": 21.3,
                "salt_g": 2.2,
            },
        ),
    ],
)
def test_reads_labels_that_print_no_ordinary_table(fixtures_dir, photo, expected):
    body = _post("/ocr/nutrition-table", fixtures_dir / "photos" / photo)
    assert body["per_100g"] == pytest.approx({**expected, "fibre_g": None})
    assert body["flags"] == []


@pytest.mark.parametrize(
    "golden_name", GOLDEN_NAMES, ids=[entry["photo"] for entry in GOLDEN_NAMES]
)
def test_reads_the_product_name_off_a_real_package_front(fixtures_dir, golden_name):
    """Exact, unlike the old similarity floor: the same model on the same photo
    gives the same boxes, and a drift here means the model changed under the
    recorded fixtures test_product_name.py reads."""
    body = _post("/ocr/product-name", fixtures_dir / "photos" / golden_name["photo"])
    assert body["text"] == golden_name["name"]
