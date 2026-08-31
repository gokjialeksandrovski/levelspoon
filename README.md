# Per100

Nutrition/meal-logging app. `docs/superpowers/archive/` holds the design specs
and implementation plans for shipped milestones (M0-M3, app redesign &
quick-log) — historical record, not current status; checklists inside were
never edited back after implementation, so ignore their checkbox state.

## Current milestone: self-hosted multi-provider quantity estimation

Precedes M4 — see
`docs/superpowers/specs/2026-08-31-omniroute-quantity-provider-design.md`.
M4 (provision cloud) resumes once this lands.

### Known gap: no capture path for unpackaged/solid food

The product database is sourced entirely from OCR'd packaging text
(`matchProduct`/`createProduct`). A food with no label — a loose egg, a
potato, a piece of fruit — has nothing for OCR to read and no product row
to match, so there is currently no way to log it. Flagged during the
2026-08-31 design pass; to be designed as its own pass before M4 starts.

### Setup

```bash
python -m venv .venv
source .venv/Scripts/activate    # Windows Git Bash; use .venv/bin/activate on Linux
pip install -e "./ocr-service[dev]"
```

paddlepaddle is **not** installed locally — it lives only in the container.
Unit tests import pure modules; the verification gate talks HTTP to the
running container.

### Commands

| Command | Does |
|---|---|
| `npm run ocr:build` | Build the OCR image (slow first time — bakes the model) |
| `npm run lint` | Ruff, with the Clean Code rules (root-level only — see note below) |
| `npm run test:ocr` | Tier-1 unit tests (fast, no Docker) |
| `npm run verify:ocr` | Tier-4 gate: real photos through the real service |
| `npm run ocr:down` | Stop the stack |
| `npm run fixtures:capture` | Record real PaddleOCR box output into `fixtures/ocr-boxes/` |
| `npm run dev:app` | Run the Next.js app's dev server |
| `npm run dev:up` | Bring up Postgres, MinIO, and the OCR service for local dev |
| `npm run dev:down` | Stop the local dev stack |
| `npm run db:migrate` | Apply Drizzle migrations to the local Postgres |
| `npm run db:seed` | Seed a test user and the 2%/10% variant pair |
| `npm run db:reset` | Drop, migrate, seed — a clean slate for a repeatable run |
| `npm run test` | Tier-2 tests against the real local Postgres (delegates into `app/`) |

`npm run lint` at the repo root only runs Ruff (Python) — it does **not** lint
the Next.js app. Run `cd app && npm run lint` separately to check the app's
own ESLint + Clean Code rules; this is a Milestone Exit Criterion for M2a and
is otherwise easy to miss.

Docker Desktop must be running. It is installed per-user here, so `docker`
is on the **User** PATH at `%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin`.

### Object storage (M2a, one-time local setup)

MinIO does not auto-create buckets. After `npm run dev:up`, create the
`per100-photos` bucket once (the value of `S3_BUCKET` in `app/.env.local`)
via the MinIO console at `http://localhost:9001` (login `per100` /
`per100_minio`), or via the `mc` CLI — the `minio/minio` image bundles its
own `mc`, reachable with `docker exec per100-minio-1 mc alias set local
http://localhost:9000 per100 per100_minio && docker exec per100-minio-1 mc mb
local/per100-photos`. Required before `app/src/lib/s3.test.ts` or any photo
upload can succeed locally.
