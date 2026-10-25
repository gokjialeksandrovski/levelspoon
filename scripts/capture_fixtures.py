"""Record raw OCR box output from the real photographs.

Run deliberately - never as part of a test run. Refreshing fixtures from
whatever the model currently produces would let a regression silently
rewrite the expectations meant to catch it.

Usage: pnpm run fixtures:capture [photo names...]   (requires: pnpm run ocr:up)
Names given: record only those photos, so adding one leaves every other
recording untouched. None given: every .jpg.
"""

import json
import sys
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parents[1]
PHOTOS = REPO_ROOT / "fixtures" / "photos"
OUTPUT = REPO_ROOT / "fixtures" / "ocr-boxes"
SERVICE_URL = "http://localhost:8000"
DEBUG_ENDPOINT = f"{SERVICE_URL}/debug/boxes"


def capture(photo: Path) -> dict:
    with photo.open("rb") as handle:
        response = httpx.post(
            DEBUG_ENDPOINT,
            files={"image": (photo.name, handle, "image/jpeg")},
            timeout=120.0,
        )
    response.raise_for_status()
    return response.json()


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    named = [PHOTOS / name for name in sys.argv[1:]]
    for photo in named or sorted(PHOTOS.glob("*.jpg")):
        boxes = capture(photo)
        destination = OUTPUT / f"{photo.stem}.json"
        destination.write_text(
            json.dumps(boxes, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        print(f"{photo.name}: {len(boxes['boxes'])} boxes -> {destination.name}")
        for box in sorted(boxes["boxes"], key=lambda item: item["confidence"])[:5]:
            print(f"   lowest confidence: {box['confidence']:.3f}  {box['text']!r}")


if __name__ == "__main__":
    main()
