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
- `docs/` — `DECISIONS.md` only. Old plans/specs deleted 2026-09-10; recover from git history.

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
product row. **Not** AI or gateway lookup. One count unit per product.
Per-product learned density — no user-editable density table, no cross-product
inference.

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
  exempt), named error types never bare `throw new Error` for domain
  failure, no silently swallowed errors, `components/ui/`↔`features/` and
  `lib/`↔`features/`/`app/` import-direction boundaries (Rule 20). Framework
  entry points (`page.tsx`, `layout.tsx`, `route.ts`) and tool-loaded configs
  (`drizzle.config.ts`, `vitest.config.ts`, `next.config.ts`,
  `eslint.config.mjs`) keep their default exports — compliant, not finding.
- Impure/heavy deps sit behind env-var-selected interface: `OCR_PROVIDER`
  and `QUANTITY_PROVIDER` pick real vs mock. `.env.example` default both to
  `mock` — real deployment must set them or every photo return canned
  result silently.
- Refactor passes add **no new production files** — extractions stay in
  same file (a `use<Thing>` hook, standalone handler, subcomponent).
- `StepView` (`capture-wizard.tsx`) use a `switch`, never `Record` lookup —
  TypeScript narrow discriminated union per `switch` case, not through
  object lookup without unsafe cast.
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

M0–M3, app redesign + quick-log, Warm Tactile re-theme,
deterministic nutrition pipeline, and direct-Gemini switch (OmniRoute
removed) all shipped. **M4 — provision cloud — next, not started.**
Nothing in flight.

### Known gap: no capture path for unpackaged/solid food

Product DB sourced entirely from OCR'd packaging text. Loose egg,
potato, or piece of fruit has no label to read and no product row to match —
no way to log it today. Gemini vision call's unique value is
exactly this loose-food case, and it is **unmeasured** (no `fixtures/photos/`
entry show unpackaged food). To be designed as own pass before M4.