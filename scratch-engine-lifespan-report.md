# OCR engine: lazy `lru_cache`+`Depends` → eager `lifespan` startup

## What changed

`ocr-service/src/per100_ocr/main.py` only. `ocr-service/tests/test_api.py` was
**not** modified (see "TestClient/lifespan branch" below for why it didn't
need to be).

Before: `get_engine()` was `@lru_cache(maxsize=1)`-wrapped and injected via
`Depends`. The real `OcrEngine()` (which loads the PaddleOCR model) was
constructed lazily on the first HTTP request that resolved the dependency —
in practice, the container's own first `/health` healthcheck. This meant:

1. `model_loaded` could never observably report `False`: any client that
   could see a response had already triggered (or waited out) construction.
2. `functools.lru_cache` takes no lock across the wrapped call. Since FastAPI
   runs sync dependencies in a threadpool, and the Docker `HEALTHCHECK` fires
   every 10s with a 5s timeout while model load can take longer, two
   concurrent cache-miss threads could both call `OcrEngine()` — a plausible
   race, and a plausible OOM under the container's 2GB limit if it happened.

After: the engine is built exactly once, in a FastAPI `lifespan` context
manager, before Uvicorn starts accepting connections. `get_engine(request)`
just reads `request.app.state.engine`, which `lifespan` populated at startup.
This matches what the plan's architecture section already stated ("`main.py`
defers its engine import into the FastAPI lifespan") — the plan's own literal
Task 12 code just hadn't implemented that.

Key points of the new `main.py`:

- `lifespan` imports `OcrEngine` locally (not at module scope), so the module
  stays importable without `paddlepaddle` installed — same deferred-import
  discipline the old code had, just moved to the right place.
- `lifespan` only constructs the real engine if `app.state.engine` isn't
  already set (`getattr(app.state, "engine", None) is None`), which is what
  lets a test pre-set a stub before startup and skip real construction
  entirely — not needed here since it turned out unnecessary (see below),
  but kept in per the target design as defense-in-depth.
- `get_engine` is a plain function taking `Request`, still swappable via
  `app.dependency_overrides` exactly as before.
- Removed the now-unused `from functools import lru_cache` import.
- `/health`'s response contract is unchanged: still
  `{"status": "ok", "model_loaded": engine.model_loaded}`.

## TestClient/lifespan branch found

**Case 1**: `TestClient(app)` constructed without an explicit
`with TestClient(app) as client:` block does **not** trigger the app's
`lifespan` startup event. Confirmed empirically — ran the full tier-1 suite
against the new `main.py` with `test_api.py` completely unmodified, and all
64 tests passed, including all 5 in `test_api.py`. No `ModuleNotFoundError`
for `paddleocr`, no failures.

This makes sense in hindsight: every one of the 5 tests in `test_api.py`
overrides `get_engine` via `app.dependency_overrides`, which replaces the
callable FastAPI invokes for that dependency wholesale — the real
`get_engine` (and its `request.app.state.engine` access) never runs in these
tests regardless of whether lifespan fires. Since lifespan additionally
never fires under a bare `TestClient(app)` construction, `app.state.engine`
is simply never touched by the test suite at all.

**Conclusion: `test_api.py` required no changes.** The fixture's existing
`dependency_overrides`-based approach continues to work unchanged.

## Full tier-1 test output

```
$ .venv/Scripts/python.exe -m pytest ocr-service/tests -m "not real" -v

============================= test session starts =============================
platform win32 -- Python 3.12.10, pytest-9.1.1, pluggy-1.6.0
collected 68 items / 4 deselected / 64 selected

ocr-service\tests\test_api.py::test_health_reports_model_state PASSED    [  1%]
ocr-service\tests\test_api.py::test_nutrition_endpoint_returns_the_spec_contract PASSED [  3%]
ocr-service\tests\test_api.py::test_product_name_endpoint_returns_text PASSED [  4%]
ocr-service\tests\test_api.py::test_unreadable_nutrition_table_returns_422_not_zeroes PASSED [  6%]
ocr-service\tests\test_api.py::test_missing_value_serialises_as_null_not_nan PASSED [  7%]
ocr-service\tests\test_boxes.py::test_box_is_immutable PASSED            [  9%]
ocr-service\tests\test_boxes.py::test_ocr_result_carries_image_dimensions PASSED [ 10%]
ocr-service\tests\test_boxes.py::test_splits_labels_and_values_into_two_columns PASSED [ 12%]
ocr-service\tests\test_boxes.py::test_scales_with_image_width_rather_than_absolute_pixels PASSED [ 14%]
ocr-service\tests\test_boxes.py::test_boxes_within_the_gap_stay_in_one_column PASSED [ 15%]
ocr-service\tests\test_boxes.py::test_returns_no_columns_for_no_boxes PASSED [ 17%]
ocr-service\tests\test_columns.py::test_finds_values_under_the_100g_header PASSED [ 18%]
ocr-service\tests\test_columns.py::test_picks_the_100g_column_not_the_per_serving_column PASSED [ 20%]
ocr-service\tests\test_columns.py::test_recognises_header_spellings[100g] PASSED [ 21%]
ocr-service\tests\test_columns.py::test_recognises_header_spellings[100 g] PASSED [ 23%]
ocr-service\tests\test_columns.py::test_recognises_header_spellings[/100 g] PASSED [ 25%]
ocr-service\tests\test_columns.py::test_recognises_header_spellings[na 100g] PASSED [ 26%]
ocr-service\tests\test_columns.py::test_raises_when_no_header_is_found PASSED [ 28%]
ocr-service\tests\test_decimals.py::test_unambiguous_value_has_one_candidate PASSED [ 29%]
ocr-service\tests\test_decimals.py::test_bare_two_digit_value_is_ambiguous PASSED [ 31%]
ocr-service\tests\test_decimals.py::test_bare_two_digit_value_with_no_unit_is_ambiguous PASSED [ 32%]
ocr-service\tests\test_decimals.py::test_recovers_a_dropped_decimal_when_the_rules_demand_it PASSED [ 34%]
ocr-service\tests\test_decimals.py::test_keeps_a_genuine_bare_integer_gram_value PASSED [ 35%]
ocr-service\tests\test_decimals.py::test_flags_the_field_when_both_readings_satisfy_the_rules PASSED [ 37%]
ocr-service\tests\test_decimals.py::test_flags_the_field_when_neither_reading_satisfies_the_rules PASSED [ 39%]
ocr-service\tests\test_decimals.py::test_recovers_multiple_simultaneously_ambiguous_fields PASSED [ 40%]
ocr-service\tests\test_decimals.py::test_flags_a_field_left_unsettled_after_a_composite_wins PASSED [ 42%]
ocr-service\tests\test_normalize.py::test_converts_label_values_to_grams[2,0 g-2.0] PASSED [ 43%]
ocr-service\tests\test_normalize.py::test_converts_label_values_to_grams[2.0g-2.0] PASSED [ 45%]
ocr-service\tests\test_normalize.py::test_converts_label_values_to_grams[  9,0  g -9.0] PASSED [ 46%]
ocr-service\tests\test_normalize.py::test_converts_label_values_to_grams[0,18 g-0.18] PASSED [ 48%]
ocr-service\tests\test_normalize.py::test_converts_label_values_to_grams[72 g-72.0] PASSED [ 50%]
ocr-service\tests\test_normalize.py::test_converts_label_values_to_grams[180 mg-0.18] PASSED [ 51%]
ocr-service\tests\test_normalize.py::test_converts_label_values_to_grams[180mg-0.18] PASSED [ 53%]
ocr-service\tests\test_normalize.py::test_raises_when_no_number_is_present[] PASSED [ 54%]
ocr-service\tests\test_normalize.py::test_raises_when_no_number_is_present[g] PASSED [ 56%]
ocr-service\tests\test_normalize.py::test_raises_when_no_number_is_present[od kojih] PASSED [ 57%]
ocr-service\tests\test_normalize.py::test_raises_when_no_number_is_present[-] PASSED [ 59%]
ocr-service\tests\test_normalize.py::test_never_returns_zero_for_unreadable_input PASSED [ 60%]
ocr-service\tests\test_normalize.py::test_reads_energy_merged_into_one_box PASSED [ 62%]
ocr-service\tests\test_normalize.py::test_reads_energy_split_across_two_boxes PASSED [ 64%]
ocr-service\tests\test_normalize.py::test_consumes_only_the_energy_boxes PASSED [ 65%]
ocr-service\tests\test_normalize.py::test_raises_when_kcal_figure_is_missing PASSED [ 67%]
ocr-service\tests\test_normalize.py::test_raises_when_no_energy_row_is_present PASSED [ 68%]
ocr-service\tests\test_parse.py::test_parses_the_golden_label PASSED     [ 70%]
ocr-service\tests\test_parse.py::test_parses_a_label_with_energy_split_across_two_boxes PASSED [ 71%]
ocr-service\tests\test_parse.py::test_recovers_a_dropped_decimal_separator PASSED [ 73%]
ocr-service\tests\test_parse.py::test_flags_a_missing_row_rather_than_defaulting_it PASSED [ 75%]
ocr-service\tests\test_parse.py::test_missing_row_is_never_silently_zero PASSED [ 76%]
ocr-service\tests\test_product_name.py::test_joins_detections_top_to_bottom PASSED [ 78%]
ocr-service\tests\test_product_name.py::test_drops_low_confidence_logo_artefacts PASSED [ 79%]
ocr-service\tests\test_product_name.py::test_keeps_percentage_variant_markers PASSED [ 81%]
ocr-service\tests\test_product_name.py::test_drops_single_character_fragments PASSED [ 82%]
ocr-service\tests\test_product_name.py::test_drops_boxes_with_no_alphanumeric_content PASSED [ 84%]
ocr-service\tests\test_product_name.py::test_returns_empty_string_when_everything_is_noise PASSED [ 85%]
ocr-service\tests\test_validate.py::test_golden_values_pass_every_rule PASSED [ 87%]
ocr-service\tests\test_validate.py::test_flags_components_exceeding_one_hundred_grams PASSED [ 89%]
ocr-service\tests\test_validate.py::test_flags_saturates_above_fat PASSED [ 90%]
ocr-service\tests\test_validate.py::test_flags_sugars_above_carbohydrate PASSED [ 92%]
ocr-service\tests\test_validate.py::test_flags_energy_failing_the_atwater_check PASSED [ 93%]
ocr-service\tests\test_validate.py::test_atwater_tolerance_admits_fibre_and_polyols PASSED [ 95%]
ocr-service\tests\test_validate.py::test_flags_kj_inconsistent_with_kcal PASSED [ 96%]
ocr-service\tests\test_validate.py::test_flags_negative_values PASSED    [ 98%]
ocr-service\tests\test_validate.py::test_flags_are_sorted_and_deduplicated PASSED [100%]

============================== warnings summary ===============================
.venv\Lib\site-packages\fastapi\testclient.py:1
  StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is
  deprecated; install `httpx2` instead.

================= 64 passed, 4 deselected, 1 warning in 0.35s =================
```

(The one warning is pre-existing, about `httpx`/`starlette.testclient`
version pinning — unrelated to this change.)

## Ruff output

```
$ .venv/Scripts/python.exe -m ruff check .
All checks passed!
```

## Files changed

- `ocr-service/src/per100_ocr/main.py` — replaced `@lru_cache`+`Depends`
  lazy engine construction with a FastAPI `lifespan` that builds the engine
  once at startup; `get_engine` now reads `request.app.state.engine`.
- `scratch-engine-lifespan-report.md` (this file) — committed alongside the
  code change per the task instructions, so the record travels with the fix.
  Not gitignored; added deliberately as a tracked file.

`ocr-service/tests/test_api.py` — read and verified, **not modified**: the
existing `dependency_overrides`-based fixture already fully isolates the
tests from real engine construction, and `TestClient(app)` without a `with`
block doesn't fire lifespan anyway, so there was nothing to adapt.

## Real-container reasoning (not run, not required)

Uvicorn always runs the `lifespan` context for a real ASGI server (unlike
`TestClient`'s ambiguous behavior without `with`). So in the actual
container, `lifespan` will construct the real `OcrEngine()` — importing and
initializing PaddleOCR — before Uvicorn binds the port and starts accepting
connections. The Docker `HEALTHCHECK`'s first curl to `/health` can now only
land after that construction has fully completed (successfully or not) or
while the process is still binding — never mid-construction on a
half-built engine, and never twice concurrently, since there's only one
startup event per process.
