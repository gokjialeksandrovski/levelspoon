"""Tier-4 gate: the real service reading the real photographs (spec §9.5).

Local only - excluded from CI by the 'real' marker, since a 133MB model and
~10s per photo buy little on every push. Required green before any deploy.

Requires: pnpm run ocr:up
"""

import json
from difflib import SequenceMatcher

import httpx
import pytest

SERVICE_URL = "http://localhost:8000"
REQUEST_TIMEOUT_SECONDS = 120.0
NAME_SIMILARITY_FLOOR = 0.6

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


def test_reads_a_product_name_close_enough_to_match_on(fixtures_dir, golden):
    """Asserted on similarity, not equality.

    Word order need only be stable enough for trigram matching (spec §4.2),
    so demanding an exact string would overfit to one photo.
    """
    text = _post(
        "/ocr/product-name", fixtures_dir / "photos" / "olympus-greek-2pct-front.jpg"
    )["text"]
    upper = text.upper()

    for token in golden["name_tokens_required"]:
        assert token in upper, f"{token!r} missing from {text!r}"

    similarity = SequenceMatcher(None, upper, golden["product"].upper()).ratio()
    assert similarity >= NAME_SIMILARITY_FLOOR, f"{similarity:.2f} for {text!r}"
