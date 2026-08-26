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

Docker Desktop must be running. It is installed per-user here, so `docker`
is on the **User** PATH at `%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin`.
