# Per100

Multi-user web app. Log meals built from ingredients. Each ingredient is a
"product" in a **shared cross-user table** (name + nutrition per 100g).
Product discovery: photo/OCR, manual entry, or barcode scan (internal
crowd-sourced DB first, Open Food Facts fallback on miss — no barcode typing,
camera only). Name encode model: every product store nutrition per 100g;
every consumed amount compute from that base.

Rules below forward-looking: what keep true, what not repeat.
Rejected/superseded approaches and reasons live in
`docs/DECISIONS.md`. Architecture map: `graphify-out/GRAPH_REPORT.md`.

## Layout

Monorepo.

- `app/` — Next.js 16 (App Router), React 19, TypeScript 5. UI, auth, business logic.
- `ocr-service/` — FastAPI + PaddleOCR (Python). Warm, always-on.
- `fixtures/` — committed test corpus (photos, OCR boxes, golden values).
- `scripts/` — dev/verification scripts. `venv-run.mjs` runs Python via `.venv`.
- `docs/` — `DECISIONS.md`, plus `superpowers/`: `plans/` (one playbook per
  shipped feature, checkboxes ticked and Proof output pasted), `specs/`, and
  `toolbox/INDEX.md`. Pre-2026-09-10 plans/specs deleted; recover from git
  history. **`toolbox/INDEX.md` RULEs bind** — each names the one file a kind
  of change belongs in. Read it before adding a portion figure, a chip source,
  or a per-user override.

Data: Postgres (local via `docker-compose.dev.yml`, host port **15432** — remapped, dodge native PG18 conflict). Drizzle ORM. Auth.js v5, Credentials provider, **JWT sessions**. Photo storage: one S3-compatible client — MinIO locally, R2 in prod, `S3_ENDPOINT` only difference, no branching in app code.

## Commands

Run from repo root.

| Command | Does |
|---|---|
| `npm run dev:up` | Postgres + MinIO + OCR service for local dev |
| `npm run dev:app` | Next.js dev server |
| `npm run db:reset` | drop, migrate, seed — clean slate |
| `npm run db:seed` | test user + 2%/10% variant pair |
| `npm run test` | tier-2 Vitest against real local Postgres (delegates into `app/`) |
| `npm run test:e2e` | Playwright, mocked providers — only Postgres needed |
| `npm run test:e2e:real` | Playwright against the real OCR stack |
| `npm run test:ocr` | tier-1 OCR unit tests, no Docker |
| `npm run verify:ocr` | tier-4 gate: real photos through the real service |
| `npm run lint` | Ruff (Python) only |
| `npm run report:photo-debt` | derived JSON, one entry per product with a reformulation claim |
| `cd app && npm run check:portion-classes` | portion-class gate — 212 curated foods, must exit 0 |

`npm run lint` at root do **not** lint app. Run `cd app && npm run lint`
separate for ESLint + Clean Code — easy miss, this a milestone exit
criterion.

Docker Desktop must run. Installed per-user: `docker` on **User** PATH.
MinIO not auto-create buckets — create `per100-photos` once (see README).

Local Postgres (port 15432) must be up before any Vitest or Playwright run —
most test files hit real database. e2e `TRUNCATE`s shared DB mid-run.

## Hard rules

### AI usage boundary — hard product requirement, not a cost detail

Gemini used **only** for amount/quantity estimation from amount-used
photo. **Never** for product-name or nutrition-value extraction — those stay
fully deterministic (OCR + parsing + rule-based validation). `estimateQuantity`
in `app/src/features/quantity/actions/quantity.ts` only action allowed call LLM.
`matchProduct` / `createProduct` / `updateProduct` deterministic, always.

### Gemini model

Pinned version, **never a `*-latest` alias** (`*-latest` measured 16.0s vs
1.36s). `GEMINI_MODEL=gemini-3.5-flash-lite`. Do not use
`gemini-2.5-flash-lite` — 404 "no longer available to new users" for projects
created after its retirement. Provider seam (`QuantityProvider`) survive
direct-Gemini → gateway → direct-Gemini unchanged; swap providers one-file
change in `app/src/lib/quantity/`.

### Secrets

Never write live key into `.env.example` or `.env.example`-tracked files —
they git-tracked. Placeholders only. `GEMINI_API_KEY` lives in
`app/.env.local`, read directly by app, not passed to container.

### Match margin rule — named constants, never inline literals

Confident match: `top1 ≥ 0.65` **and** `top1 − top2 ≥ 0.15`. Ambiguous:
`top1 ≥ 0.35` and not confident. No match: `top1 < 0.35`. Reason: trigram
similarity cannot separate variants ("Olympus Greek Yogurt 2% Fat" vs
"10% Fat" score far above 0.65 against each other). Absolute-threshold-only
would silently attach wrong product's nutrition to shared cache.

### One label photo, one product

Photo key **is** content hash (`app/src/lib/db/photo-keys.ts`), so `UNIQUE` on
`products.nutrition_photo_key` and `product_overrides.nutrition_photo_key`
enforce it in Postgres. Never mint a photo key another way — a `randomUUID()`
key silently opts that row out of the ban.

Reuse refused at three points: `ocrNutritionTable` (earliest, both entry paths
funnel there, returns `NutritionRead`'s `photo-already-used` variant),
`createProduct`, and `saveNutritionOverride` (`assertPhotoUnused` +
`findPhotoOwner`, probing both the proof and claim key forms of the same
bytes). Refuse **before** upload — an orphaned object otherwise. Never
`deletePhoto` a key equal to the one about to be written: same bytes, same
key, and the delete would take the live object —
`saveNutritionOverride`'s guard is `supersededPhotoKey !== pendingPhoto?.key`.

Ban is unconditional; **owner naming is not**. Name the owner only when its
row passes `visibleToUser`, else generic — naming an invisible row leaks
another user's private product or private claim.

Fixtures must seed a per-row photo key. A shared literal
(`test/placeholder.jpg`) breaks the index, not the rule.

`LabelPhotoAlreadyUsedError` still throws all the way to its caller — the one
exception to the boundary rule below. It is a backstop for a race the
nutrition step already turned into a good path, so degrading to generic copy
here costs nothing a user would notice.

### Same figures, same product

Byte hash catches a reused file, never the same label re-shot from another
angle. So `createProduct` also refuses on exact match of all seven figures
under the same `nutrition_basis_unit`/`nutrition_basis_quantity`:

- name similarity ≥ `AMBIGUOUS_SIMILARITY_THRESHOLD` and row visible →
  `duplicate_product` result, carrying that row.
- else → `same_figures` result, cleared only by `acknowledgedSameFigures`.
  Not a hard block: every brand of water reads `0` across the board.

`decideDuplicate` is the tested statement of this rule; `findSameFigures`'s
SQL mirrors it for one indexed round trip. Disagreement means the SQL is wrong.

Name similarity picks the tier, is never a condition — "candy bar" scores ~0
against "Bella Farm YOGHURT 2,8% m.m", and that case is the one worth catching.

**Refusal crosses to the client as data, never a thrown class.** A Server
Action's thrown error reaches a client component as a plain `Error` —
subclass identity and every custom property stripped, and a production build
also replaces `.message`, leaving only `.digest`. `DuplicateProductError` and
`SameFiguresError` (and `BarcodeAlreadyLinkedError`) still throw, but only
inside `products.ts`, where nothing outside the module ever sees the throw —
that is what keeps `instanceof` reliable there. `createProduct` catches each
at its own boundary and returns `CreateProductResult`
(`created`/`duplicate_product`/`same_figures`/`barcode_conflict`), the same
shape `barcode.ts`'s `LookupBarcodeResult` already used for this reason.
`confirm-step.tsx` consumes it through an exhaustive `switch` with a
`const _exhaustive: never = result` default arm, never `instanceof`. Reach for
this shape, not a thrown class, for the next refusal a Server Action needs to
hand back to a client component.

### Typed search compares romanized text, never raw names

Every product row carry `name_search`: `toSearchText(name)`
(`app/src/lib/db/search-text.ts`, any-ascii) lowercase ASCII. Column
`notNull` with no default, so a forgotten insert fail at compile time
rather than file row nobody can find. `searchUserProducts` and
`searchStandardFoods` romanize query same way, so "Сирење" reachable from
Latin keyboard. Token ILIKE alone not enough, because a romanization is
a spelling and not the spelling ("sirenje" vs "sirene"). So a query also
match on whole-string trigram score above `TYPED_SEARCH_MIN_SIMILARITY`.
`matchProduct` deliberately still score raw `name`: margin rule tuned on
OCR strings.

### Confirm step is the shared-cache safety net

Fires **only** for brand-new product about to write to shared table,
or ambiguous match being resolved. Show what read, flag failed-
validation fields, let user correct before save. Label photo upload
to storage **only after** this confirmation — abandoned flows leave no orphaned
objects.

### Manual gram entry is first-class

Not fallback. Accepting AI value unedited → `quantity_source =
ai_estimated`; any edit or direct entry → `manual`. Gemini outage cost one
typed number, not broken app.

### AI-photo consent

One-time consent modal before first amount-photo. **Verbatim legal copy —
never paraphrase.** Per-device, `localStorage` key `per100:ai-photo-consent`.
Wording vendor-neutral; naming Google deliberately not required.
Server-recorded consent M4 follow-up.

### Numeric precision

All per-100g nutrition columns Postgres `numeric`, never `real` — float
accumulation artifacts. Read into JS as number only at point of
arithmetic; column type protect storage precision, not runtime type.

### Server/client boundary

Every file under `app/src/lib/db/`, `app/src/lib/s3.ts`,
`app/src/features/*/actions/*`, `app/src/auth.ts` start with `"use server"`
or only imported by files that do. Never imported from Client Component.
Server actions only path from browser to Postgres, storage, or Gemini.
`'use server'` files export only async functions.

### Auth

`session.strategy` must be `"jwt"` — Auth.js throws `UnsupportedStrategy` with
Credentials provider otherwise.

### No cloud accounts for dev

Local Postgres + MinIO stand in for Neon + R2. Nothing in dev require cloud
project or bucket. M4 provisions cloud; not started.

## Nutrition pipeline (`ocr-service/src/per100_ocr/nutrition/`)

Deterministic: photo → boxes → normalize → parse (EU-first, US-fallback) →
validate. `reading.py` shared result shape for both branches.

- **Split kJ/kcal energy row single highest-risk parser defect.** Label
  splitting kJ and kcal into two boxes yield one extra numeric box and
  shift every subsequent field by one, silently. `split_energy_row` consume
  energy row as one logical row regardless of how OCR split it.
- **`engine.py` only impure module** in OCR package — PaddleOCR
  wrapper. Everything else pure and directly testable. paddlepaddle not
  installed locally; lives only in container.
- EU per-100g column detection anchors on energy figure.
- US label: two-pass geometric marker→figure association.
- Decimal-separator recovery run **only when provably needed** (EU decimal
  comma; PaddleOCR drops separators).
- No per-100g header → **fail loudly**, never invent values. `ColumnDetectionError`.
- Validation deterministic sanity rules (Atwater, kJ↔kcal, component-total,
  negatives). FDA-locked unit constants (`fl oz = 30`, not `29.5735`).
- Constants derived from measurement carry comment naming evidence.

## Household measure → grams

Pure library at `app/src/lib/measures/`, plus learned gram value stored on
product row. **Not** AI or gateway lookup. Per-product learned density — no
user-editable density table, no cross-product inference.

One *learned* count unit per product: `learnFromServing` records a single
`serving_unit`/`serving_grams` pair, because that is all a label ever teaches.
Portions are a second layer above it — see below.

## Portions, chips and recent amounts

A portion is an amount nobody printed on a label: a slice of bread, an EU egg
grade, a cup of cooked rice. Curated, not learned, and layered like this:

- `portions.ts` — gram figures by portion class. **Every new figure goes here,
  never inline at a call site, never in the database.** Each carries a comment
  naming its source, and is edible weight (no shell, no packaging).
- `portion-class.ts` — which class a product is, by `standard_slug` or by
  romanized name. Cup classes are slug-only. Two name matches means no match.
- `resolve-portions.ts` — **the only place portion precedence is decided**.
  Most specific wins: the user's override beats what this product's label
  taught, which beats the class default. Slug beats name for picking the
  class, and a product whose nutrition basis is not `g` gets no portions at
  all. A consumer gets a finished `Portion[]` and never re-merges.
- `portion_overrides` — per-user grams for one label of one product. **Never
  write a portion weight to `products`.** Read it as a correlated
  `jsonb_object_agg` subquery, never a `LEFT JOIN`: one row per label, and a
  join multiplies search results.
- `meal_ingredients.entry_count` / `entry_unit` — what the user actually said,
  beside the resolved `quantity`/`quantity_unit`. Nullable, no backfill.
  **Nutrition maths reads `quantity` only**; these two are for display
  (`quantityText`) and for recents. Every write path that saves or edits an
  amount fills them.
- `recentAmounts` (`features/meals/actions/meals.ts`) — the most recent
  distinct *amounts* for a product, newest first, soft-deleted rows excluded.
  Distinct means the count and unit together, not the unit alone, so 200 g and
  250 g are two chips. `RECENT_AMOUNT_LIMIT` decides how many. Never
  re-resolve the weight; it comes off the stored `quantity`.

Two UI rules fall out of this, both easy to break:

- **One chip row, never two.** A new chip source adds a builder to
  `amount-chips.utils.ts` and merges into the same list (`mergeChips`, recents
  first). Every chip prints its gram weight. Both amount screens — the capture
  step and the cooking-fat sheet — render the same `AmountChips`.
- **A value gets one control.** `unitsForSelect` drops any unit already
  offered as a chip from the unit select, keeping only the unit in play so the
  select can always show its own value.

Re-run `cd app && npm run check:portion-classes` after touching `PortionClass`,
`CLASS_BY_SLUG`, `NAME_TOKENS_BY_CLASS`, `EXCLUDED_TOKENS_BY_CLASS` or
`fixtures/standard-foods.json`. It must exit 0 — a conflict is a portion chip
about to appear on a food nobody measures that way.

## Time

Day boundaries are user's **local** calendar day (browser IANA timezone,
per request), never server's UTC day.

## App conventions

- **Prefer framework/project components over raw HTML equivalents (CLAUDE.md
  global Rule 16, project-specific extension).** Covers Next.js built-ins
  (`Link` not `<a>`, `Image` not `<img>`) and this project's own
  `components/ui/` wrappers: `Button` (`app/src/components/ui/button.tsx`,
  `variant` primary/ghost/danger/fat for filled/outlined boxes, `link` for
  underlined text-link actions, `pending` for busy+spinner) not raw
  `<button>`; `Field`/`UnitAmountField` not raw `<input>`/`<select>`;
  `Sheet` not raw `<dialog>`; `PhotoInput` not raw `<input type="file">`.
  Raw HTML stays only for shapes no wrapper covers: icon-only controls
  (`ICON_TAP_TARGET_CLASS` — back chevron, header icons) and full-width
  list-row results (`CookingFatResultButton`-style) — structurally
  different from a CTA/link, not a missing variant. Not ESLint-enforced
  (blanket ban false-positives on those shapes) — self-review against this
  list, same as CLAUDE.md's other judgment-only rules.
- Feature-based directory structure (CLAUDE.md global Rule 20): `app/src/app/`
  is routing shell only. Business logic groups by domain under
  `app/src/features/<domain>/actions/` (`auth`, `meals`, `products` — includes
  `ocr.ts`, `quantity`). `app/src/components/ui/` holds dumb presentational
  primitives only, `app/src/components/layout/` holds global chrome
  (`app-header.tsx`) — neither imports from `features/`. `app/src/lib/`
  holds shared infra and must not import from `features/` or `app/`.
  Route-specific UI (e.g. the capture wizard's steps, day/meal detail views)
  stays colocated inside its own route folder under `app/src/app/(app)/`
  rather than moving to `features/` until a second route needs it.
  Cross-domain shared types (e.g. `NutritionValues`) live in `app/src/types/`.
- Clean Code rules **mechanically enforced** by `app/eslint.config.mjs`
  (vendored `app/clean-code-rules.mjs`): named exports only (error), arrow
  functions not `function` (`func-style`), low cyclomatic complexity and
  shallow nesting not raw line count (`complexity`/`max-depth`/
  `max-nested-callbacks`, warn), no magic numbers (only `-1, 0, 1, 2`
  exempt), no silently swallowed errors, `components/ui/`↔`features/` and
  `lib/`↔`features/`/`app/` import-direction boundaries (Rule 20). Framework
  entry points (`page.tsx`, `layout.tsx`, `route.ts`) and tool-loaded configs
  (`drizzle.config.ts`, `vitest.config.ts`, `next.config.ts`,
  `eslint.config.mjs`) keep their default exports — compliant, not finding.
- **Named error types are judgment-only, not linted.** A named class earns
  its keep only where something discriminates on it. This section used to
  claim production code discriminated exactly one, `BarcodeAlreadyLinkedError`
  in `confirm-step.tsx` — false even before 2026-09-20, and not just stale:
  a Server Action's thrown error reaches a client component as a plain
  `Error`, subclass identity and every custom property stripped, so that
  `instanceof` check was always `false` and that branch never fired.
  Production code discriminates three now — `BarcodeAlreadyLinkedError`,
  `DuplicateProductError`, `SameFiguresError` — all by `instanceof`, all
  inside `products.ts` only, which is what keeps `instanceof` reliable: the
  throw never leaves that module. `createProduct` maps each to
  `CreateProductResult`, and `confirm-step.tsx` discriminates that union's
  `kind` instead, never a class — see "Same figures, same product" above.
  Tests discriminate seven more via `.rejects.toThrow`, which is also a
  reason to name one. Of 19 classes in `app/src`, nine go undiscriminated
  anywhere. Name a failure when a caller or test must tell it apart from its
  siblings — but when that caller is a Server Action's client component,
  name a result-union member, not an error class, or the name never survives
  the trip. Leave a bare `throw new Error` for boot-time invariants nothing
  can catch (missing env var in `lib/s3.ts`, `lib/db/index.ts`,
  `lib/ocr/http-provider.ts`). A blanket ESLint ban was considered and
  rejected 2026-09-17: it cannot see which throws are domain failures.
- Impure/heavy deps sit behind env-var-selected interface: `OCR_PROVIDER`
  and `QUANTITY_PROVIDER` pick real vs mock. `.env.example` default both to
  `mock` — real deployment must set them or every photo return canned
  result silently.
- Refactor passes add **no new production files** — extractions stay in
  same file (a `use<Thing>` hook, standalone handler, subcomponent).
- `StepView` (`capture-wizard.tsx`) use a `switch`, never `Record` lookup —
  TypeScript narrow discriminated union per `switch` case, not through
  object lookup without unsafe cast.
- `wizardReducer` carry repo's only `eslint-disable-next-line complexity`
  directive: exhaustive switch over discriminated union score one per case, and
  splitting table to clear threshold hide state map. Every case needing real
  work already delegate to named `render*`/`apply*` function. `StepView` carried
  second until barcode entry stopped being a step of its own (2026-09-19) and it
  dropped under threshold — don't add second disable back without that argument.
  Directive must be **last** line before code — justification comment after it
  disable nothing and report "Unused eslint-disable directive".
- `app/AGENTS.md` regenerated by `next dev` — this Next.js differ from
  training data; read `app/node_modules/next/dist/docs/` before using
  Next.js API. Commit block with your work rather than fight it.

## Tests

- No `@testing-library/react`, no `.test.tsx`. Logic tested as pure
  functions (Vitest, node env). Component behavior via Playwright e2e.
- Per-module `.test.ts` / `.test.py` convention.
- Verification tiers: 1 unit (no Docker) · 2 real Postgres · 3 e2e mock ·
  4 real photos through real OCR · 5 real stack. Tiers 4–5 not in CI
  (133 MB model, ~10 s per photo) — run locally before deploy.
- Real photos and golden per-100g values committed in `fixtures/`.
- Some client-side specs fail when run **alone** with
  `npx vitest run <one file>` — `Cannot find module 'next/server' imported
  from next-auth/lib/env.js`, an ESM resolution artifact, not a broken test.
  `amount-step.test.ts` is one. Run the suite, or a directory, instead of
  chasing it.
- `app/playwright.config.ts` has an explicit `testMatch` allowlist. **A new
  spec file must be added to it**, or it collects as "No tests found" and the
  suite still passes. `workers: 1` / `fullyParallel: false` because every spec
  truncates the same Postgres tables.

## Design system — "Warm Tactile Minimal"

- Both light and dark themes real, chosen by `prefers-color-scheme`, no
  manual toggle. **Dark is no-preference default** (bare `:root`).
- Four accents, each exactly one semantic role, never decorative: paprika
  `#E05A47` = protein, amber `#E5983B` = carbs, plum `#8B4A62` = fat, matcha
  `#6E9B66` = log-success state only. kcal hero number carry no accent.
- Every accent-coded element pair its color with redundant non-color cue.
- `motion/react` used for exactly two categories: press-feedback spring and
  log-success pulse. Everything else CSS, gated behind
  `prefers-reduced-motion: reduce`.
- No modals. `Sheet`'s `<dialog>` bottom-sheet only overlay.
- No color token ship without passing computed WCAG/OKLab
  contrast + distinguishability gate (`app/src/lib/theme/contrast.ts`).

## Current state

M0–M3, app redesign + quick-log, Warm Tactile re-theme, deterministic
nutrition pipeline, and direct-Gemini switch (OmniRoute removed) all shipped.

Since then, shipped as playbooks under `docs/superpowers/plans/`: typed product
search + truthful provenance + per-user nutrition overrides (2026-09-17), then
the portion stack (2026-09-18, playbooks 01–05) — portion engine, class
resolution, the quick-amount chip row, per-user portion gram overrides, and
recent amounts with the entry echo on `meal_ingredients`. Cooking fats got the
same chip row 2026-09-19.

Playbook 06 (`2026-09-18-06-cup-measure.md`) shipped 2026-09-19: `cup` is
offered wherever a density is genuinely known.

Photo and product identity (`2026-09-20-photo-and-product-identity.md`)
shipped 2026-09-20: content-addressed label-photo keys, the two-tier
same-figures gate, and duplicate suggestions on an Open Food Facts hit — see
"One label photo, one product" and "Same figures, same product" above. A
duplicate is now caught at write time on every entry path. Merging duplicates
already stored is a separate, unstarted concern: no production data exists
yet, so no merge tool was built — reconsider once there is one to merge.

Every playbook under `docs/superpowers/plans/` is now done. **M4 — provision
cloud — next, not started.**

### Known gap: no *photo* path for unpackaged food

Narrower than it was. A loose egg, potato or apple is loggable today: the
"Whole food, no packaging" step searches 212 curated standard rows
(`fixtures/standard-foods.json`), and the portion stack gives them tappable
amounts — an egg by grade, rice by the cup. Typing the name is the whole cost.

What is still missing is reading an unpackaged food from a photo. The product
DB's photo path is still OCR'd packaging text only, so a food with no label
cannot be captured by camera, and a food outside the curated 212 cannot be
captured at all. Gemini vision's unique value is exactly this case and it is
still **unmeasured** — no `fixtures/photos/` entry shows unpackaged food. Own
design pass before M4.