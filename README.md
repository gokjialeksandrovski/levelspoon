# levelspoon

levelspoon is a meal-logging web app built for a phone held in one hand. You build each meal from ingredients. Every ingredient is a product stored with its nutrition per 100 g, and the app works out the totals from how much you ate.

You rarely type a nutrition figure. Take a photo of the label and an OCR service reads it. Take a photo of the barcode, or type its digits, and the app looks in its own database first and Open Food Facts second. Loose food like apples or rice comes from a list of 246 standard foods.

Products are shared between users, so a label one person scans is already there for the next. If a figure looks wrong to you, correct it for your account only. Nobody else's numbers change.

AI is optional and does two things, both with your own Gemini API key. It can estimate how many grams you ate from a photo, and it can give a rough, itemized guess for a meal you describe when you can't be bothered to log it properly. Those guesses stay private and are marked as estimates. Label figures never come from an LLM.

You can set a calorie goal and macro targets yourself, save a meal as a recipe, log your weight, and look back over past weeks. The app won't hand out streaks or badges, and it won't tell you what to eat.

Built with Next.js 16, React 19, Postgres and Drizzle, Auth.js, a FastAPI + PaddleOCR service, and S3-compatible photo storage (MinIO locally).

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
cd app && pnpm install && cd ..

# Env: copy .env.example to app/.env.local and fill AUTH_SECRET (pnpm dlx auth secret)

# Local stack: Postgres (15432), MinIO (9000/9001), OCR service (8000)
pnpm run dev:up
```

Create the photo bucket once (MinIO does not auto-create it). Either via console at `http://localhost:9001` (login `levelspoon` / `levelspoon_minio`), or:

```bash
docker exec levelspoon-minio-1 mc alias set local http://localhost:9000 levelspoon levelspoon_minio
docker exec levelspoon-minio-1 mc mb local/levelspoon-photos
```

Then:

```bash
pnpm run db:reset    # drop, migrate, seed (test user + 246 standard foods)
pnpm run dev:app     # Next.js dev server
```

## Checks

```bash
pnpm run test:ocr           # Python unit tests, no Docker
pnpm run test               # Vitest against local Postgres
pnpm run test:e2e           # Playwright, mocked providers
pnpm run lint               # Ruff only
cd app && pnpm run lint     # ESLint + Clean Code
```

Full command list: `docs/ARCHITECTURE.md`.
