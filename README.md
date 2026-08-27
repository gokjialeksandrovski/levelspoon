# Per100

Nutrition/meal-logging app. See `docs/superpowers/specs/` for the design spec
and `docs/superpowers/plans/` for implementation plans.

## Current milestone: M1 — OCR service

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
| `npm run lint` | Ruff, with the Clean Code rules |
| `npm run test:ocr` | Tier-1 unit tests (fast, no Docker) |
| `npm run verify:ocr` | Tier-4 gate: real photos through the real service |
| `npm run ocr:down` | Stop the stack |
| `npm run fixtures:capture` | Record real PaddleOCR box output into `fixtures/ocr-boxes/` |

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
