"""HTTP surface for the OCR service (spec §4.5).

The engine is built once at startup (see `lifespan`), before Uvicorn
starts accepting connections, and injected as a dependency so tests can
substitute a stub. Building it eagerly at startup rather than lazily on
the first request is what makes `/health`'s `model_loaded` a real signal
instead of a value that's already true by the time anything can observe
it, and rules out two concurrent healthcheck hits racing to construct the
model twice under the container's memory limit.
"""

import math
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import asdict
from typing import TYPE_CHECKING

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

from .nutrition.columns import ColumnDetectionError
from .nutrition.normalize import NormalizationError
from .nutrition.parse import parse_nutrition
from .nutrition.validate import NutritionValues, validate
from .product_name import extract_net_weight_text, extract_product_name

if TYPE_CHECKING:
    from .engine import OcrEngine

UNPROCESSABLE = 422


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Construct the one warm engine before the app starts serving requests.

    Imported here, not at module scope, so this module stays importable
    (and testable) without paddlepaddle installed - the import only ever
    executes when the real app actually starts up. The `getattr` guard lets
    a test pre-set `app.state.engine` to a stub before startup runs, so the
    real (paddle-requiring) construction never happens under test.
    """
    if getattr(app.state, "engine", None) is None:
        from .engine import OcrEngine

        app.state.engine = OcrEngine()
    yield


app = FastAPI(title="levelspoon OCR", version="0.1.0", lifespan=lifespan)


def get_engine(request: Request) -> "OcrEngine":
    """Return the engine built once at startup by `lifespan`."""
    return request.app.state.engine


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


def _optional_values(values) -> dict | None:
    return None if values is None else _serialisable(values)


@app.get("/health")
def health(engine=Depends(get_engine)) -> dict:
    """Reports model load state, not merely that the process is listening."""
    return {"status": "ok", "model_loaded": engine.model_loaded}


@app.post("/ocr/product-name")
async def read_product_name(image: UploadFile = File(...), engine=Depends(get_engine)) -> dict:
    result = engine.read(await image.read())
    return {"text": extract_product_name(result), "net_weight_text": extract_net_weight_text(result)}


@app.post("/ocr/nutrition-table")
async def read_nutrition_table(image: UploadFile = File(...), engine=Depends(get_engine)) -> dict:
    result = engine.read(await image.read())
    try:
        reading = parse_nutrition(result)
    except (ColumnDetectionError, NormalizationError) as error:
        raise HTTPException(status_code=UNPROCESSABLE, detail=str(error)) from error

    return {
        "format": reading.label_format.value,
        "per_100g": _optional_values(reading.per_100g),
        "per_serving": _optional_values(reading.per_serving),
        "serving_size_text": reading.serving_size_text,
        "serving_grams": reading.serving_grams,
        "servings_per_container": reading.servings_per_container,
        "flags": list(reading.flags),
    }


class NutritionValuesRequest(BaseModel):
    """Wire shape for /validate - the same snake_case fields as everywhere else.

    `fibre_g` defaults to None so a client that has no figure simply omits it.
    """

    energy_kcal: float
    fat_g: float
    saturates_g: float
    carbohydrate_g: float
    sugars_g: float
    protein_g: float
    salt_g: float
    fibre_g: float | None = None


class ValidateRequest(BaseModel):
    values: NutritionValuesRequest
    energy_kj: float | None = None


@app.post("/validate")
async def validate_nutrition(request: ValidateRequest) -> dict:
    """Re-runs the same deterministic rules used at OCR ingestion (spec §4.6),
    so correcting a product catches the same 10x errors confirm-step already
    catches, without any AI involvement (spec §1)."""
    values = NutritionValues(**request.values.model_dump())
    flags = validate(values, energy_kj=request.energy_kj)
    return {"flags": list(flags)}


@app.post("/debug/boxes")
async def debug_boxes(image: UploadFile = File(...), engine=Depends(get_engine)) -> dict:
    """Raw detections, for recording fixtures (spec §11 fixtures:capture)."""
    result = engine.read(await image.read())
    return {
        "image_width": result.image_width,
        "image_height": result.image_height,
        "boxes": [asdict(box) for box in result.boxes],
    }
