# levelspoon

Meal-logging app: meals built from ingredients, nutrition per 100 g, read from labels by OCR rather than typed.

- What it is and for whom: `PRODUCT.md`
- How it's built, every command, env vars: `docs/ARCHITECTURE.md`
- Working rules for agents: `CLAUDE.md`
- Why it's shaped this way: `docs/DECISIONS.md`
- What's next: `docs/ROADMAP.md`

## Quick start

Needs Docker Desktop, Node, Python 3.12.

```bash
# Python (OCR service unit tests)
python -m venv .venv
source .venv/Scripts/activate    # Windows Git Bash; .venv/bin/activate on Linux
pip install -e "./ocr-service[dev]"

# App deps
cd app && npm install && cd ..

# Env: copy .env.example to app/.env.local and fill AUTH_SECRET (npx auth secret)

# Local stack: Postgres (15432), MinIO (9000/9001), OCR service (8000)
npm run dev:up
```

Create the photo bucket once (MinIO does not auto-create it). Either via console at `http://localhost:9001` (login `levelspoon` / `levelspoon_minio`), or:

```bash
docker exec levelspoon-minio-1 mc alias set local http://localhost:9000 levelspoon levelspoon_minio
docker exec levelspoon-minio-1 mc mb local/levelspoon-photos
```

Then:

```bash
npm run db:reset    # drop, migrate, seed (test user + 232 standard foods)
npm run dev:app     # Next.js dev server
```

## Checks

```bash
npm run test:ocr           # Python unit tests, no Docker
npm run test               # Vitest against local Postgres
npm run test:e2e           # Playwright, mocked providers
npm run lint               # Ruff only
cd app && npm run lint     # ESLint + Clean Code
```

Full command list: `docs/ARCHITECTURE.md`.
