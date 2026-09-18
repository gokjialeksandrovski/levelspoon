# Per100

Nutrition/meal-logging app. Working rules live in `CLAUDE.md`; why the app is
shaped this way, and what was tried and dropped, in `docs/DECISIONS.md`.
`docs/superpowers/plans/` hold one playbook per shipped feature — a record of
how something was built, not current status.

## Current state

M0-M3, app redesign & quick-log, the Warm Tactile re-theme, the deterministic
nutrition pipeline and the direct-Gemini switch all shipped. So did typed
product search, per-user nutrition overrides, and the portion stack: quick
amount chips ("1 slice · 28 g"), per-user portion weights, and recent amounts
that offer back however a product was last logged.

Next: playbook 06 (cup measure), then M4 — provision cloud. Neither started.

### Known gap: no *photo* path for unpackaged food

A loose egg, potato or apple is loggable by name today — 212 curated standard
foods, each with tappable portions. What is missing is reading an unpackaged
food from a photo: the product database's photo path is still OCR'd packaging
text (`matchProduct`/`createProduct`), so a food with no label cannot be
captured by camera, and one outside the curated 212 cannot be captured at all.
Own design pass before M4.

### Setup

```bash
python -m venv .venv
source .venv/Scripts/activate    # Windows Git Bash; use .venv/bin/activate on Linux
pip install -e "./ocr-service[dev]"
```

paddlepaddle **not** installed local — live only in container.
Unit tests import pure modules; verify gate talk HTTP to
running container.

### Commands

| Command | Does |
|---|---|
| `npm run ocr:build` | Build OCR image (slow first time — bake model) |
| `npm run lint` | Ruff, with Clean Code rules (root-level only — see note below) |
| `npm run test:ocr` | Tier-1 unit tests (fast, no Docker) |
| `npm run verify:ocr` | Tier-4 gate: real photos through real service |
| `npm run ocr:down` | Stop stack |
| `npm run fixtures:capture` | Record real PaddleOCR box output into `fixtures/ocr-boxes/` |
| `npm run dev:app` | Run Next.js app dev server |
| `npm run dev:up` | Bring up Postgres, MinIO, OCR service for local dev |
| `npm run dev:down` | Stop local dev stack |
| `npm run db:migrate` | Apply Drizzle migrations to local Postgres |
| `npm run db:seed` | Seed test user and 2%/10% variant pair |
| `npm run db:reset` | Drop, migrate, seed — clean slate for repeatable run |
| `npm run test` | Tier-2 tests against real local Postgres (go into `app/`) |
| `npm run test:e2e` | Playwright, mocked providers — only Postgres needed |
| `npm run test:e2e:real` | Playwright against the real OCR stack |
| `npm run report:photo-debt` | Derived JSON: products with a reformulation claim |
| `cd app && npm run check:portion-classes` | Portion-class gate over the 212 curated foods |

`npm run lint` at repo root only run Ruff (Python) — it do **not** lint
Next.js app. Run `cd app && npm run lint` separate to check app's
own ESLint + Clean Code rules; this a milestone exit criterion and easy to
miss otherwise.

Docker Desktop must run. It installed per-user here, so `docker`
sit on **User** PATH at `%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin`.

### Object storage (M2a, one-time local setup)

MinIO not auto-create buckets. After `npm run dev:up`, make
`per100-photos` bucket once (value of `S3_BUCKET` in `app/.env.local`)
via MinIO console at `http://localhost:9001` (login `per100` /
`per100_minio`), or via `mc` CLI — `minio/minio` image bundle its
own `mc`, reach with `docker exec per100-minio-1 mc alias set local
http://localhost:9000 per100 per100_minio && docker exec per100-minio-1 mc mb
local/per100-photos`. Need this before `app/src/lib/s3.test.ts` or any photo
upload can work local.