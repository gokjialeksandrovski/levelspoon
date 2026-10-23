# Architecture

Stack, layout, data, routes, env vars, local commands and test setup.

## Stack

| Part | What |
|---|---|
| `app/` | Next.js 16 (App Router), React 19, TypeScript 5. UI, auth, business logic. |
| `ocr-service/` | FastAPI + PaddleOCR (Python 3.12). Warm, always-on. |
| Database | Postgres via Drizzle ORM. Migrations in `app/drizzle/`. |
| Auth | Auth.js v5, Credentials providers (email/password; `guest` for demo mode), JWT sessions. |
| Photo storage | One S3-compatible client (`app/src/lib/s3.ts`). MinIO locally. `S3_ENDPOINT` only difference between environments, no branching in app code. Prod host undecided (`docs/ROADMAP.md`). |
| AI | Gemini, direct call, pinned model. Two jobs only (see CLAUDE.md). |

Nothing deployed. No CI.

## Repo layout

| Path | Holds |
|---|---|
| `app/` | Next.js app |
| `ocr-service/` | OCR + nutrition parser. `src/levelspoon_ocr/nutrition/` is the parser (`docs/PRODUCTS.md`). |
| `fixtures/` | Committed test corpus: real label photos, OCR boxes, golden per-100g values, `standard-foods.json` (232 curated rows) |
| `scripts/` | Dev/verification scripts. `venv-run.mjs` runs Python via `.venv`. |
| `docs/` | This doc set, `DECISIONS.md`, `ROADMAP.md`, `superpowers/specs/` (approved design specs per shipped feature) |
| `PRODUCT.md`, `DESIGN.md` | Root on purpose: impeccable skill reads them there |

## App structure (`app/src/`)

| Path | Holds |
|---|---|
| `app/` | Routing shell. Route-specific UI colocates in its route folder (capture wizard steps, day and meal views) until a second route needs it. |
| `features/<domain>/actions/` | Server Actions, `*.utils.ts` (pure maths), `*.store.ts` (userId-taking DB writers, no `"use server"`). Domains: `auth`, `goals`, `intake`, `lazy-track`, `meals`, `products` (incl. `ocr.ts`), `quantity`, `recipes`, `weight`. |
| `components/ui/` | Dumb presentational primitives. Never import `features/`. |
| `components/layout/` | Global chrome: `app-header.tsx`, `theme-toggle.tsx`, `install-app-button.tsx` (PWA install; manifest in `app/manifest.ts`), `timezone-refresh.tsx`. Never import `features/`. |
| `lib/` | Shared infra: `db/` (schema, search text, photo keys, effective nutrition), `measures/`, `nutrition/`, `ocr/`, `quantity/`, `meal-estimate/`, `barcode/`, `gemini/`, `theme/`, `date/`, `s3.ts`. Never imports `features/` or `app/`. |
| `types/` | Cross-domain shared types (`NutritionValues`) |

Import boundaries are ESLint-enforced (`app/eslint.config.mjs`, vendored `app/clean-code-rules.mjs`).

## Routes

| Route | Page |
|---|---|
| `/` | Server redirect to `/day/<today local>` |
| `/day/[date]` | Day view: kcal hero, macros, meal list, weight row (today only), new-meal bar |
| `/meals/[mealId]` | Meal detail, recipe controls |
| `/meals/[mealId]/capture` | Capture wizard: add ingredient (photo, barcode, name search, standard food, recipe, lazy track) |
| `/products/[productId]/correct` | Per-user nutrition override / label proof |
| `/history` | One row per logged day, month groups, week summary |
| `/calories/estimate` | Intake estimate, reached only from goal sheet |
| `/signin`, `/signup` | Credentials auth |
| `/demo` | Demo disclaimer, starts guest session |
| `/api/auth/[...nextauth]` | Auth.js handler |

## Server/client boundary

Server Actions only path from browser to Postgres, storage or Gemini. Files under `app/src/lib/db/`, `app/src/lib/s3.ts`, `app/src/features/*/actions/*`, `app/src/auth.ts` start with `"use server"` or are imported only by files that do. `*.store.ts` files take a userId and carry no `"use server"`: exposing one as an action would let a browser read or write any user's rows. Every export of a `"use server"` file is a callable endpoint, so a userId-taking reader (`fetchCalorieGoal`, `fetchWeightView`) lives in a store too.

## Data loading

- **Page reads run on server.** Day, meal, history, capture and intake pages read in `page.tsx` and pass data down. Never a Server Action called from `useEffect` on mount: Next dispatches actions one at a time per client, so mount reads queue behind each other and behind any save.
- **Day, meal, history stream.** Page starts read, passes unresolved promise (`DayLoad`, `MealLoad`, `HistoryLoad`) to client view, which `use()`s it under `Suspense` with `DelayedFallback`. Failed read resolves to `{ status: "error" }`, never rejects. `LiveStatus` sits outside boundary: live region must exist before its text changes.
- **Capture and intake await** both reads with `Promise.all`; each is a convenience, so a failure degrades to null/empty.
- **Writes call `refresh()`** (`next/cache`) when a page shows their data: meal ingredient writes, `restoreMeal`, goals, weight, intake save, recipe writes, `logLazyMeal`. Open page re-renders in same response and client cache drops every other page, so Back never lands on pre-write figures. No client reload callbacks. `deleteMeal` does not refresh: it navigates away, and refresh would first repaint meal as not found. Product corrections refresh client-side (`router.refresh()` in `correction-form.tsx`), keyed remount there depends on it. Vitest mocks `next/cache` in `vitest.setup.ts`.
- Reads triggered by interaction stay client actions: load-more history, recent amounts, search, `getDayEnergy` after a capture save.

## Bundle

- Animated elements use `motion/react-m` (imported as `motion`). `LazyMotion strict` in `providers.tsx` loads `domMax` (`lib/motion/features.ts`) after first paint and throws on a full `motion` component.
- Tap-only sheets: `Sheet` renders nothing until first open, then stays mounted for close transition. Large sheets (`GoalSheet`, `WeightGoalSheet`, `EditRecipeSheet`, `SaveRecipeSheet`) load through `next/dynamic` and mount on first open (open token > 0).

## Demo mode

Guest = `users` row with `is_guest`, signed in by `guest` provider (`app/src/auth.ts`); `session.user.isGuest` carries it. Server enforces, UI only hides:

- `requireAccountUserId` (`app/src/lib/auth/require-user.ts`) refuses guests: `estimateQuantity`, `estimateMeal`, `logLazyMeal`, `linkBarcode`, `attachLabelProof`.
- `createProduct` drops photo and barcode, `saveNutritionOverride` drops claim photo: guest rows stay private by `visibleToUser`.
- `ocrProductName` / `ocrNutritionTable` take a scan from `demo_quota` (`app/src/lib/db/demo-quota.ts`) for guests, else return `demo-limit`. Per-IP and all-guests counters, plus per-IP demo starts. IP keyed by HMAC with `AUTH_SECRET`.
- Limits in `app/src/lib/demo/limits.ts`, printed by `DemoTerms` (`features/demo/components/`). Change both sides together.
- Client reads guest flag via `useIsGuest`; root layout seeds `SessionProvider` so first paint is right.

## Provider seams

Impure/heavy deps sit behind env-selected interfaces. `.env.example` defaults each to `mock`; real deployment must set them or every call returns canned result silently.

| Env var | Seam | Real implementation |
|---|---|---|
| `OCR_PROVIDER` | `app/src/lib/ocr/` | HTTP to `ocr-service` |
| `QUANTITY_PROVIDER` | `QuantityProvider`, `app/src/lib/quantity/` | Gemini. Swapping provider is one-file change. |
| `MEAL_ESTIMATE_PROVIDER` | `app/src/lib/meal-estimate/` | Gemini. Mock throws on `MOCK_UNAVAILABLE_MARKER` in description (e2e hook for unavailable path). |
| `BARCODE_LOOKUP_PROVIDER` | `app/src/lib/barcode/` | Open Food Facts. Internal `product_barcodes` table checked first regardless. |

## Env vars

Template: `.env.example` (git-tracked, placeholders only). App reads `app/.env.local`.

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres. Local: `postgres://levelspoon:levelspoon@localhost:15432/levelspoon` |
| `AUTH_SECRET` | Auth.js secret (`pnpm dlx auth secret`) |
| `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE` | Photo storage. Local MinIO, bucket `levelspoon-photos`. |
| `OCR_SERVICE_URL`, `OCR_PROVIDER` | OCR service URL, `mock` or real |
| `QUANTITY_PROVIDER` | Amount-photo grams, `mock` or Gemini |
| `MEAL_ESTIMATE_PROVIDER` | Lazy track, `mock` or Gemini |
| `GEMINI_API_KEY` | `app/.env.local` only, read by app, not passed to a container |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` (pinned; see CLAUDE.md) |
| `BARCODE_LOOKUP_PROVIDER` | `mock` or Open Food Facts |
| `OFF_CONTACT_EMAIL` | Open Food Facts User-Agent contact (their terms). Real address before deploy. |

## Time model

Day boundaries are user's **local** calendar day (browser IANA timezone, per request), never server UTC day.

Timezone reaches server components through `levelspoon-tz` cookie, written by blocking `TIMEZONE_INIT_SCRIPT` in root layout `<head>` on every full load (`lib/date/timezone-cookie.ts`). `requestTimezone()` (`lib/date/request-timezone.ts`) reads and validates it; unknown zone counts as missing. Page needing "today" renders `TimezoneRefresh` when cookie missing (first request before script ran): it calls `router.refresh()` once cookie exists. Server Actions still take timezone as argument from browser.

`meals.log_date` is day a meal counts towards: browser's local date when meal started, stored, never derived from `created_at`. Every day read filters on it: `getDayLog`, `getDayHistory`, `dailyKcalTotals`, meal numbering. `created_at` means only "when row written": ordering inside a day, `recentAmounts`, soft-delete sweep. Stored because a meal eaten yesterday can be entered today, and a timestamp cannot tell those apart. A day reads the same wherever reader is.

`createMeal(logDate, timezone)` refuses a future date (`InvalidLogDateError`), never a past one. Screen that starts a meal passes the day on screen.

Every reachable day is loggable. Day view bottom bar middle slot is always `NewMealButton`; label names the day when not today ("New meal for yesterday"). Header day label is the way back to today; no separate "Back to today" control.

## Local commands

Run from repo root unless noted. Docker Desktop must run (installed per-user: `docker` on **User** PATH, `%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin`).

| Command | Does |
|---|---|
| `pnpm run dev:up` / `dev:down` | Postgres (host port **15432**, remapped to dodge native PG18) + MinIO (9000, console 9001) + OCR service (8000). `dev:up` rebuilds OCR image from source. |
| `pnpm run dev:app` | Next.js dev server |
| `pnpm run db:migrate` | Apply Drizzle migrations |
| `pnpm run db:seed` | Test user, 2%/10% variant pair, 232 standard foods |
| `npx tsx scripts/seed.ts --standard-only` (in `app/`, `DATABASE_URL` set) | System user + 232 standard foods only. For deployed DBs: no dev fixtures in shared table |
| `pnpm run db:reset` | Drop, migrate, seed |
| `pnpm run ocr:build` / `ocr:up` / `ocr:down` | OCR image alone (first build slow: bakes model) |
| `pnpm run fixtures:capture` | Record real PaddleOCR box output into `fixtures/ocr-boxes/` |
| `pnpm run test` | Tier-2 Vitest against real local Postgres (delegates into `app/`) |
| `pnpm run test:e2e` | Playwright, mocked providers, only Postgres needed |
| `pnpm run test:e2e:real` | Playwright against real OCR stack |
| `pnpm run test:ocr` | Tier-1 OCR unit tests, no Docker |
| `pnpm run verify:ocr` | Tier-4 gate: real photos through real service |
| `pnpm run lint` | Ruff (Python) **only** |
| `cd app && pnpm run lint` | ESLint + Clean Code rules for the app |
| `pnpm run report:photo-debt` | Derived JSON, one entry per product with a reformulation claim |
| `cd app && pnpm run check:portion-classes` | Portion-class gate over 232 curated foods, must exit 0 |

Python setup (`ocr-service`): see `README.md`. paddlepaddle is **not** installed locally, lives only in container. Unit tests import pure modules; verify gate talks HTTP to running container.

### Local gotchas

- MinIO does not auto-create buckets. Create `levelspoon-photos` once (steps in `README.md`). Needed before `app/src/lib/s3.test.ts` or any photo upload.
- `pnpm run db:migrate` alone fails migration `0014` ("could not create unique index") on a dev DB seeded before content-addressed photo keys: old fixtures share a literal photo key across rows. Use `db:reset` on such a DB.
- Applied migration files stay byte-for-byte immutable: drizzle-orm hashes each file for its applied-migration bookkeeping.
- Generate migrations with drizzle-kit, never hand-write: journal and snapshot must stay in step.

## Tests

Verification tiers: 1 unit (no Docker) · 2 real Postgres · 3 e2e mock · 4 real photos through real OCR · 5 real stack. Tiers 4–5 run locally before deploy (133 MB model, ~10 s per photo).

- Local Postgres must be up before any Vitest or Playwright run; most test files hit real DB. e2e `TRUNCATE`s shared DB mid-run.
- No `@testing-library/react`, no `.test.tsx`. Logic tested as pure functions (Vitest, node env). Component behaviour via Playwright e2e.
- Per-module `.test.ts` / `.test.py` beside the module.
- Real photos and golden per-100g values committed in `fixtures/`.
- Some client-side specs fail when run **alone** (`pnpm exec vitest run <one file>`) with `Cannot find module 'next/server' imported from next-auth/lib/env.js`: ESM resolution artifact, not a broken test (`amount-step.test.ts` is one). Run the suite or a directory.
- `app/playwright.config.ts` has an explicit `testMatch` allowlist. A new spec file must be added or it collects as "No tests found" and suite still passes. `workers: 1` / `fullyParallel: false` because every spec truncates same tables.
