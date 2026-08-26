"""HTTP surface for the OCR service (spec §4.5).

The engine is injected as a dependency so tests can substitute a stub, and
imported lazily inside the provider so this module stays importable in an
environment with no paddlepaddle installed.
"""

import math
from dataclasses import asdict
from functools import lru_cache

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile

from .nutrition.columns import ColumnDetectionError
from .nutrition.normalize import NormalizationError
from .nutrition.parse import parse_nutrition
from .product_name import extract_product_name

app = FastAPI(title="Per100 OCR", version="0.1.0")

UNPROCESSABLE = 422


@lru_cache(maxsize=1)
def get_engine():
    """One warm engine per process; imported here so tests need no paddle."""
    from .engine import OcrEngine

    return OcrEngine()


def _serialisable(values) -> dict:
    """Render a missing value as JSON null rather than a bare NaN literal.

    Python's json module happily writes `NaN`, which is not valid JSON and
    which JSON.parse rejects - so the M2 client would fail on exactly the
    incomplete-table case §8 requires it to handle gracefully. `null` is also
    what the confirm step wants: a blank, flagged field (spec §8).
    """
    return {
        field: None if isinstance(value, float) and math.isnan(value) else value
        for field, value in asdict(values).items()
    }


@app.get("/health")
def health(engine=Depends(get_engine)) -> dict:
    """Reports model load state, not merely that the process is listening."""
    return {"status": "ok", "model_loaded": engine.model_loaded}


@app.post("/ocr/product-name")
async def read_product_name(image: UploadFile = File(...), engine=Depends(get_engine)) -> dict:
    result = engine.read(await image.read())
    return {"text": extract_product_name(result)}


@app.post("/ocr/nutrition-table")
async def read_nutrition_table(image: UploadFile = File(...), engine=Depends(get_engine)) -> dict:
    result = engine.read(await image.read())
    try:
        reading = parse_nutrition(result)
    except (ColumnDetectionError, NormalizationError) as error:
        raise HTTPException(status_code=UNPROCESSABLE, detail=str(error)) from error

    return {"values": _serialisable(reading.values), "flags": list(reading.flags)}
