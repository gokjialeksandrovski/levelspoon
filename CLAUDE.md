# CLAUDE.md

## First Steps

Read `docs/ARCHITECTURE.md` before doing anything. It covers stack, repo and app layout, routes, env vars, time model, local commands and test setup.

| Doc | Read when |
|---|---|
| `docs/ARCHITECTURE.md` | Always |
| `docs/PRODUCTS.md` | Touching `features/products/`, `lib/db/` product queries, OCR, barcode, label photos, typed search, confirm step, or `ocr-service/` |
| `docs/AMOUNTS.md` | Touching grams, units, `lib/measures/`, portions, amount chips, recent amounts, `features/quantity/`, AI-photo consent |
| `docs/MEALS.md` | Touching `/history`, `features/recipes/`, `features/lazy-track/`, recipe sheets on meal page |
| `docs/GOALS.md` | Touching `features/goals/`, `features/weight/`, `features/intake/`, goal sheet, weight row, `/calories/estimate` |
| `DESIGN.md` | Adding or changing UI: colour, theme, type, motion, overlays |
| `PRODUCT.md` | Writing UI copy, or adding a feature that states or advises a figure |
| `docs/DECISIONS.md` | Before proposing an approach: check it wasn't already rejected or deferred |
| `docs/ROADMAP.md` | Planning next work, or M4 hosting |
| `docs/DEPLOY.md` | Touching the hosted instance: home-server containers, ports, secrets, migrate/seed/update commands |
| `docs/specs/` | Changing a shipped feature: its approved design spec |
| `app/AGENTS.md` | Before using any Next.js API (this Next.js differs from training data; read `app/node_modules/next/dist/docs/`) |

When a change makes one of these docs wrong, update the doc in the same change. Docs describe what exists, not plans. A rejected or superseded approach goes in `docs/DECISIONS.md` with its reason.

## Scope

Multi-user web app. Log meals built from ingredients. Each ingredient is a "product" in a **shared cross-user table** (name + nutrition per 100g). Product discovery: label photo/OCR, manual entry, curated standard-food search, barcode (internal DB first, Open Food Facts fallback; read from photo or typed digits, no live camera scanning).

Do NOT:

- Call an LLM outside the two Gemini jobs below.
- Require a cloud account or bucket for dev. Local Postgres + MinIO stand in.
- Put calorie arithmetic in `features/weight/` (`docs/GOALS.md`).
- Add streaks, badges, coaching, encouragement or shame copy, or a second place that advises intake (`PRODUCT.md`).
- Add modals. `Sheet` is the only overlay.
- Add a standalone recipes page, or a duplicate-merge tool (`docs/DECISIONS.md`).
- Add subscriptions or payments. AI is BYOK only (`docs/DECISIONS.md`).

## Environment

- Windows 11. Docker Desktop must run (`docker` on **User** PATH).
- Node: pnpm, lockfile (`pnpm-lock.yaml`) in `app/`. Root `package.json` holds orchestration scripts only.
- Python: `.venv` at repo root, `ocr-service` installed editable. paddlepaddle only in container.
- Local Postgres on host port **15432**, must be up before any Vitest or Playwright run.
- `pnpm run lint` at root is Ruff only. Run `cd app && pnpm run lint` separately for ESLint + Clean Code; milestone exit criterion, easy to miss.

## Hard rules

### AI usage boundary

Hard product requirement, not cost detail. Gemini has exactly two jobs:

1. Grams from amount-used photo: `estimateQuantity` (`app/src/features/quantity/actions/quantity.ts`).
2. Lazy-track estimate: `estimateMeal` (`app/src/features/lazy-track/actions/lazy-track.ts`). Output lands **only** on private `products` rows with `nutrition_origin = 'ai_estimate'`: never shared, searchable, matched, or linked to barcode or label photo (`docs/MEALS.md`).

Product names and nutrition on every other path stay deterministic (OCR + parsing + rule-based validation). `matchProduct` / `createProduct` / `updateProduct` never call an LLM.

### Gemini model

Pinned version, **never a `*-latest` alias** (measured 16.0s vs 1.36s). `GEMINI_MODEL=gemini-3.5-flash-lite`. Not `gemini-2.5-flash-lite`: 404 "no longer available to new users" for projects created after its retirement.

### Secrets

Never write a live key into `.env.example` or any tracked file. Placeholders only. `GEMINI_API_KEY` lives in `app/.env.local`.

### Shared product table

Shared cache is the thing worth protecting. Refuse duplicates and reused label photos at write time (`docs/PRODUCTS.md`). Never mint a photo key except via `app/src/lib/db/photo-keys.ts`. Match-margin thresholds are named constants, never inline literals.

### Numeric precision

Every nutrition and weight column Postgres `numeric`, never `real`: float accumulation artifacts. Read into JS as number only at point of arithmetic.

### Server/client boundary

Server Actions are the only path from browser to Postgres, storage or Gemini. Files under `app/src/lib/db/`, `app/src/lib/s3.ts`, `app/src/features/*/actions/*`, `app/src/auth.ts` start with `"use server"` or are imported only by files that do; never from a Client Component. `"use server"` files export only async functions. `*.store.ts` takes a userId and carries no `"use server"`.

### Refusals cross as data

Server Action's thrown error reaches a client component as bare `Error` (class, properties and, in production, `.message` stripped). Any refusal a client must tell apart is a discriminated result union (`CreateProductResult` pattern) consumed by exhaustive `switch` with a `never` default arm. Named error classes stay inside their module. Details: `docs/PRODUCTS.md`.

### Auth

`session.strategy` must be `"jwt"`: Auth.js throws `UnsupportedStrategy` with Credentials provider otherwise.

### Verbatim copy

AI-photo consent copy and intake consent copy are verbatim legal text: never paraphrase. Bump `CONSENT_VERSION` when intake consent changes.

### Migrations

Generate with drizzle-kit, never hand-write. Never edit an applied migration file (drizzle-orm hashes them).

## Project conventions

- **Project components over raw HTML** (global Rule 16 extension). Next.js `Link`/`Image`, and `components/ui/` wrappers:
  - `Button` (`app/src/components/ui/button.tsx`): `variant` primary/ghost/danger/fat for boxes, `link` for underlined text actions, `pending` for busy+spinner. Not raw `<button>`.
  - `Field` / `UnitAmountField` not raw `<input>`/`<select>`. `FigureField` for a figure checked row by row against something printed (confirm and lazy-track review tables).
  - `StickyActionBar` for a step's commit button below a long form.
  - `Sheet` not raw `<dialog>`. `PhotoInput` not raw `<input type="file">`.
  - Raw HTML only where no wrapper fits: icon-only controls (`ICON_TAP_TARGET_CLASS`: back chevron, header icons) and full-width list-row results (`StandardFoodResultButton`-style, `standard-food-picker.tsx`). Not ESLint-enforced; self-review.
- **Feature layout** (global Rule 20): `app/src/app/` routing shell only; domain logic in `app/src/features/<domain>/actions/`; route-only UI colocates in its route folder until a second route needs it; cross-domain types in `app/src/types/`. Map in `docs/ARCHITECTURE.md`.
- **Pure maths in `*.utils.ts`**, never in a component or Server Action body. Server re-runs any figure that round-trips through the browser.
- Clean Code rules mechanically enforced by `app/eslint.config.mjs` (vendored `app/clean-code-rules.mjs`). Framework entry points and tool-loaded configs keep default exports.
- **Named error class only where something discriminates on it**: a caller in the same module, or a test (`.rejects.toThrow`). Toward a client component, name a result-union member instead. Bare `throw new Error` for boot-time invariants nothing catches (missing env var in `lib/s3.ts`, `lib/db/index.ts`, `lib/ocr/http-provider.ts`).
- Refactor passes add **no new production files**: extractions stay in same file (a `use<Thing>` hook, standalone handler, subcomponent).
- `StepView` (`capture-wizard.tsx`) uses `switch`, never `Record` lookup: TypeScript narrows a discriminated union per case, not through an object lookup.
- `wizardReducer` (`capture-wizard.types.ts`) and `StepView` carry the repo's only two `eslint-disable-next-line complexity` directives: exhaustive switch over a discriminated union scores one per case, every real case already delegates to a named `render*`/`apply*` function, and splitting the table would hide the state map rather than shrink it. Don't add a third without the same argument. Directive must be the **last** line before code; a comment after it disables nothing and reports "Unused eslint-disable directive".
- Per-device UI state uses `localStorage` keys prefixed `levelspoon:`.
- Every new e2e spec file is added to `app/playwright.config.ts` `testMatch`, or it silently collects nothing.
- `app/AGENTS.md` is regenerated by `next dev`. Commit its block with your work rather than fight it.
