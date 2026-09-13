# Per100

Nutrition/meal-logging app. `docs/superpowers/archive/` hold design specs
and implementation plans for shipped milestones (M0-M3, app redesign &
quick-log) — old record, not current status; checklists inside never edited back after implementation, so ignore checkbox state.

## Current milestone: direct Gemini quantity estimation

Before M4 — see
`docs/superpowers/specs/2026-09-03-direct-gemini-quantity-estimation-design.md`.
This replace self-hosted OmniRoute gateway approach
(`2026-08-31-omniroute-quantity-provider-design.md`, kept as old record
only — gateway and container gone now).
M4 (provision cloud) start again once this land.

### Known gap: no capture path for unpackaged/solid food

Product database come all from OCR'd packaging text
(`matchProduct`/`createProduct`). Food with no label — loose egg, potato,
piece of fruit — got nothing for OCR read and no product row
to match, so no way to log it now. Flagged during 2026-08-31 design pass; need own design pass before M4 start.

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

`npm run lint` at repo root only run Ruff (Python) — it do **not** lint
Next.js app. Run `cd app && npm run lint` separate to check app's
own ESLint + Clean Code rules; this Milestone Exit Criterion for M2a and
easy to miss otherwise.

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