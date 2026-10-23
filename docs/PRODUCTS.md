# Products

Rules for shared `products` table: nutrition figures, matching, label-photo identity, duplicate gate, typed search, confirm step, OCR nutrition pipeline.

Every product stores nutrition per 100 g (or 100 ml, `nutrition_basis_unit`/`nutrition_basis_quantity`); every consumed amount computes from that base. Table shared cross-user; per-user corrections live in `product_overrides`, read through `effectiveNutrition` (`coalesce(override, product)`).

## Nutrition figures

- Eight figures: kcal, fat, saturates, carbohydrate, sugars, protein, salt, fibre. `NutritionValues` in `app/src/types/nutrition.ts`.
- Columns Postgres `numeric`, never `real`. Read into JS as number only at point of arithmetic.
- **Fibre is the one nullable figure** (`fibreG: number | null`): EU labels may omit it. Unknown is `null`, never `0`. Blank fibre never blocks Save. Shows `—`. Sums add known values, `null` only when neither side has one; guard before `Number()` because `Number(null)` is `0`. Day and meal totals state coverage (`(4 of 6 ingredients)`) only when some ingredient lacks fibre.
- Open Food Facts absent fibre maps to `null`, not `MISSING_NUTRIENT_VALUE` (0) that the seven mandatory figures use.
- Override ceiling: `coalesce` means user can override fibre to a figure but not back to unknown. Accepted.
- Standard foods (`fixtures/standard-foods.json`) require `fibreG` present and ≥ 0: curated row has no excuse to be unknown.

## Match margin rule

Named constants, never inline literals. Confident: `top1 ≥ 0.65` **and** `top1 − top2 ≥ 0.15`. Ambiguous: `top1 ≥ 0.35` and not confident. No match: `top1 < 0.35`.

Why: trigram similarity cannot separate variants ("Olympus Greek Yogurt 2% Fat" vs "10% Fat" score far above 0.65 against each other). Absolute threshold alone would attach wrong product's nutrition to shared cache.

`matchProduct`, `createProduct`, `updateProduct` deterministic, always.

## One label photo, one product

Photo key **is** content hash (`app/src/lib/db/photo-keys.ts`), so `UNIQUE` on `products.nutrition_photo_key` and `product_overrides.nutrition_photo_key` enforces it in Postgres. Never mint a photo key another way: a `randomUUID()` key silently opts that row out of the ban.

- Key extension is sniffed from bytes (`extensionFromBytes`: PNG signature, else jpg), never from caller-declared MIME type. Browser `<input type="file">` reports type from file name, so trusting it lets a renamed file mint a second key. `photo.type` stays correct for upload content-type header only.
- Hash covers bytes as uploaded, not as shot: browser downscales any photo over 2048 px and re-encodes JPEG (`lib/photo/downscale.ts`), so same shot picked on two browsers can mint two keys.
- Reuse refused at three points: `ocrNutritionTable` (earliest; both entry paths funnel there; returns `NutritionRead`'s `photo-already-used` variant), `createProduct`, `saveNutritionOverride` (`assertPhotoUnused` + `findPhotoOwner`, probing both proof and claim key forms of same bytes).
- Refuse **before** upload, else orphaned object.
- Never `deletePhoto` a key equal to the one about to be written: same bytes, same key, delete takes live object. `saveNutritionOverride` guard: `supersededPhotoKey !== pendingPhoto?.key`.
- Ban unconditional; **owner naming is not**. Name owner only when its row passes `visibleToUser`, else generic copy: naming an invisible row leaks another user's private product or claim. Exception: an override names its own author unconditionally (leaks nothing user doesn't know).
- Fixtures seed a per-row photo key. Shared literal (`test/placeholder.jpg`) breaks the index.
- `LabelPhotoAlreadyUsedError` still throws from `createProduct` to its caller: backstop for a race the nutrition step already turned into a good path, generic copy costs nothing. `saveNutritionOverride` has no earlier good path, so returns `SaveNutritionOverrideResult` (`saved` / `photo_already_used`).

## Same figures, same product

Byte hash catches reused file, never same label re-shot. So `createProduct` also refuses exact match of seven mandatory figures under same `nutrition_basis_unit`/`nutrition_basis_quantity`:

- name similarity ≥ `AMBIGUOUS_SIMILARITY_THRESHOLD` and row visible → `duplicate_product` result, carrying that row.
- else → `same_figures` result.

Both tiers cleared by `acknowledgedSameFigures`. Two bottled waters or two pasta shapes off one brand's shared table are genuinely different products with identical figures; a hard block makes the second unfileable, and the only workaround (nudge a figure) writes false nutrition into shared cache. "Use X instead" stays tier 1's primary action; acknowledgement checkbox is escape for honest collision.

- Gate compares **seven** figures, never fibre. `NUTRITION_FIELDS` (`products.ts`) excludes fibre on purpose: a nullable eighth field lets a real duplicate through whenever one side lacks fibre.
- `decideDuplicate` is tested statement of the rule; `findSameFigures` SQL mirrors it in one indexed round trip, scoring `name_search` against `toSearchText(input.name)`. Disagreement means SQL is wrong.
- Name similarity picks the tier, never a condition: "candy bar" scores ~0 against "Bella Farm YOGHURT 2,8% m.m", and that case is worth catching.
- **Ceiling.** `hasSameFigures` is exact equality: sound for two OCR reads of one label, not for OCR vs third party's transcription (Open Food Facts 484 vs OCR 485 kcal). Barcode `external_match` path's duplicate suggestions (`searchUserProducts` on OFF `nameGuess`, capped at `DUPLICATE_SUGGESTION_LIMIT`) cover that, advisory and dismissible. Residual: bytes differ (real re-shot) *and* figures differ by any amount *and* name unlike original.

## Refusals cross to client as data

Server Action's thrown error reaches a client component as plain `Error`: subclass identity and custom properties stripped, production build also replaces `.message` (only `.digest` left). So:

- `DuplicateProductError`, `SameFiguresError`, `BarcodeAlreadyLinkedError` throw only inside `products.ts`, where `instanceof` stays reliable.
- `createProduct` catches each and returns `CreateProductResult` (`created` / `duplicate_product` / `same_figures` / `barcode_conflict`), same shape as `barcode.ts`'s `LookupBarcodeResult`.
- `confirm-step.tsx` consumes it through exhaustive `switch` with `const _exhaustive: never = result` default arm, never `instanceof`.

## Typed search compares romanized text

Every product row carries `name_search`: `toSearchText(name)` (`app/src/lib/db/search-text.ts`, any-ascii), lowercase ASCII. Column `notNull`, no default, so forgotten insert fails at compile time. `searchUserProducts` and `searchStandardFoods` romanize query same way ("Сирење" reachable from Latin keyboard). Token ILIKE alone not enough (a romanization is *a* spelling: "sirenje" vs "sirene"), so query also matches on whole-string trigram score above `TYPED_SEARCH_MIN_SIMILARITY`. `matchProduct` deliberately still scores raw `name`: margin rule tuned on OCR strings.

## Confirm step is shared-cache safety net

Fires **only** for brand-new product about to write to shared table, or ambiguous match being resolved. Shows what was read, flags failed-validation fields, lets user correct before save. Label photo uploads **only after** confirmation: abandoned flows leave no orphaned objects.

## Barcode

Internal crowd-sourced `product_barcodes` first, Open Food Facts on miss, then photo/manual flow. Camera or photo only, no barcode typing. Every barcode is read from a photo by `readBarcodeFromPhoto` (`lib/barcode/read-photo.ts`, `barcode-detector` WASM self-hosted under `public/zxing/`); no live camera scanning. Spec: `docs/superpowers/specs/2026-09-15-barcode-scanning-design.md`.

## Nutrition pipeline (`ocr-service/src/levelspoon_ocr/nutrition/`)

Deterministic: photo → boxes → normalize → parse (EU-first, US-fallback) → validate. `reading.py` shared result shape for both branches.

- **Split kJ/kcal energy row is highest-risk parser defect.** Label splitting kJ and kcal into two boxes yields one extra numeric box and shifts every later field by one, silently. `split_energy_row` consumes energy row as one logical row however OCR split it.
- EU parser maps values positionally. Two named row orders, 7-row (with fibre) and 6-row, picked by value count. No label-text inference: value column drifts on curved packaging. Ceiling: a label printing another optional row (polyols, starch) still shifts.
- US label: two-pass geometric marker→figure association. `dietary fib(?:er|re)` is the only optional marker (absent → `None`, never `NormalizationError`). Total Carbohydrate normalised to EU convention: `carbohydrate_g = total − fibre_g` (21 CFR 101.9(c)(6)(i)), same shape as `SODIUM_TO_SALT_FACTOR`.
- `engine.py` only impure module (PaddleOCR wrapper). Everything else pure and directly testable.
- EU per-100g column detection anchors on energy figure.
- Decimal-separator recovery runs **only when provably needed** (EU decimal comma; PaddleOCR drops separators).
- No per-100g header → **fail loudly**, never invent values: `ColumnDetectionError`.
- Validation: deterministic sanity rules (Atwater ±30%, kJ↔kcal, component total incl. known fibre, negatives; `fibre_g` `None` exempt). No fibre ≤ carbohydrate rule: under EU convention fibre sits outside carbohydrate.
- FDA-locked unit constants (`fl oz = 30`, not `29.5735`).
- Constants derived from measurement carry a comment naming evidence.

Spec: `docs/superpowers/specs/2026-09-24-fibre-design.md`.
