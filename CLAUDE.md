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
- `docs/` — `DECISIONS.md`, plus `superpowers/`: `plans/` (one playbook per
  shipped feature, checkboxes ticked and Proof output pasted), `specs/`, and
  `toolbox/INDEX.md`. Pre-2026-09-10 plans/specs deleted; recover from git
  history. **`toolbox/INDEX.md` RULEs bind** — each names the one file a kind
  of change belongs in. Read it before adding a portion figure, a chip source,
  or a per-user override.

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
| `npm run report:photo-debt` | derived JSON, one entry per product with a reformulation claim |
| `cd app && npm run check:portion-classes` | portion-class gate — 212 curated foods, must exit 0 |

`npm run lint` at root do **not** lint app. Run `cd app && npm run lint`
separate for ESLint + Clean Code — easy miss, this a milestone exit
criterion.

`npm run db:migrate` alone (not `db:reset`) fails migration `0014` with
"could not create unique index" on a dev DB seeded before this branch —
that DB's fixtures share a literal photo key (e.g. `test/placeholder.jpg`)
across rows, which the migration's new `UNIQUE` index refuses. `db:reset`
(drop, migrate, seed from scratch) is the path on such a DB, not `db:migrate`.
An applied migration file itself stays byte-for-byte immutable — drizzle-orm
hashes each migration file's content for its own applied-migration
bookkeeping, so editing one after it has run against a DB that recorded its
original hash is its own hazard, worse than the one this note warns about.

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

### One label photo, one product

Photo key **is** content hash (`app/src/lib/db/photo-keys.ts`), so `UNIQUE` on
`products.nutrition_photo_key` and `product_overrides.nutrition_photo_key`
enforce it in Postgres. Never mint a photo key another way — a `randomUUID()`
key silently opts that row out of the ban.

The key's extension is sniffed from the bytes (`extensionFromBytes` - PNG's own
signature, else jpg), never from a caller-declared MIME type. A browser
`<input type="file">` reports its type from the file's name, so a renamed file
used to mint a second key for one photo and evade the index entirely — fixed
2026-09-20. `photo.type` is still correct for the upload's content-type
header; only the key's extension changed source.

Reuse refused at three points: `ocrNutritionTable` (earliest, both entry paths
funnel there, returns `NutritionRead`'s `photo-already-used` variant),
`createProduct`, and `saveNutritionOverride` (`assertPhotoUnused` +
`findPhotoOwner`, probing both the proof and claim key forms of the same
bytes). Refuse **before** upload — an orphaned object otherwise. Never
`deletePhoto` a key equal to the one about to be written: same bytes, same
key, and the delete would take the live object —
`saveNutritionOverride`'s guard is `supersededPhotoKey !== pendingPhoto?.key`.

Ban is unconditional; **owner naming is not**. Name the owner only when its
row passes `visibleToUser`, else generic — naming an invisible row leaks
another user's private product or private claim. The one exception: an
override names its own author unconditionally — a user trying the same bytes
on a second product is shown their own row both times, and that leaks nothing
they do not already know.

Fixtures must seed a per-row photo key. A shared literal
(`test/placeholder.jpg`) breaks the index, not the rule.

`LabelPhotoAlreadyUsedError` still throws all the way to its caller from
`createProduct` — the one exception to the boundary rule below. It is a
backstop for a race the nutrition step already turned into a good path, so
degrading to generic copy here costs nothing a user would notice.
`saveNutritionOverride` has no earlier good path, so it never had this luxury —
it returns `SaveNutritionOverrideResult` (`saved` / `photo_already_used`) as
data instead, same reasoning as `CreateProductResult` below.

### Same figures, same product

Byte hash catches a reused file, never the same label re-shot from another
angle. So `createProduct` also refuses on exact match of all seven figures
under the same `nutrition_basis_unit`/`nutrition_basis_quantity`:

- name similarity ≥ `AMBIGUOUS_SIMILARITY_THRESHOLD` and row visible →
  `duplicate_product` result, carrying that row.
- else → `same_figures` result.

Both tiers are cleared the same way, by `acknowledgedSameFigures` — tier 1
included, since 2026-09-20. Two brands of bottled water, or two dried-pasta
shapes off one brand's shared per-100g table, can score above the threshold on
name alone while being genuinely different products; water is not among the
212 curated standard foods, so a hard tier-1 block with no escape made the
second brand permanently unfileable, and the only workaround (nudge a figure)
writes false nutrition into the shared cache — the exact corruption this gate
exists to prevent. "Use X instead" stays tier 1's primary action; the
acknowledgement checkbox is the escape for the honest collision, same as
tier 2's. Not a hard block anywhere in this gate: every brand of water reads
`0` across the board.

`decideDuplicate` is the tested statement of this rule; `findSameFigures`'s
SQL mirrors it for one indexed round trip, scoring `name_search` against
`toSearchText(input.name)` — the "typed search compares romanized text, never
raw names" rule below applies to this comparison too. Disagreement between
the two means the SQL is wrong.

Name similarity picks the tier, is never a condition — "candy bar" scores ~0
against "Bella Farm YOGHURT 2,8% m.m", and that case is the one worth catching.

**Ceiling, stated honestly.** `hasSameFigures` is exact equality, sound for
two OCR reads of one printed label — not for OCR vs. a third party's
transcription of it. An Open Facts contributor's figure can round what OCR
read exactly (484 vs. 485 kcal) and defeat the gate silently; nothing here
catches that with certainty. What covers it is the barcode `external_match`
path's duplicate suggestions (`searchUserProducts` on the OFF `nameGuess`,
capped at `DUPLICATE_SUGGESTION_LIMIT`) — advisory and dismissible, not a
gate. The full residual: bytes differ (a real re-shot — a caller-declared MIME
type can no longer manufacture this, see above) *and* figures differ by any
amount including third-party rounding *and* the name is unlike the original.

**Refusal crosses to the client as data, never a thrown class.** A Server
Action's thrown error reaches a client component as a plain `Error` —
subclass identity and every custom property stripped, and a production build
also replaces `.message`, leaving only `.digest`. `DuplicateProductError` and
`SameFiguresError` (and `BarcodeAlreadyLinkedError`) still throw, but only
inside `products.ts`, where nothing outside the module ever sees the throw —
that is what keeps `instanceof` reliable there. `createProduct` catches each
at its own boundary and returns `CreateProductResult`
(`created`/`duplicate_product`/`same_figures`/`barcode_conflict`), the same
shape `barcode.ts`'s `LookupBarcodeResult` already used for this reason.
`confirm-step.tsx` consumes it through an exhaustive `switch` with a
`const _exhaustive: never = result` default arm, never `instanceof`. Reach for
this shape, not a thrown class, for the next refusal a Server Action needs to
hand back to a client component.

### Typed search compares romanized text, never raw names

Every product row carry `name_search`: `toSearchText(name)`
(`app/src/lib/db/search-text.ts`, any-ascii) lowercase ASCII. Column
`notNull` with no default, so a forgotten insert fail at compile time
rather than file row nobody can find. `searchUserProducts` and
`searchStandardFoods` romanize query same way, so "Сирење" reachable from
Latin keyboard. Token ILIKE alone not enough, because a romanization is
a spelling and not the spelling ("sirenje" vs "sirene"). So a query also
match on whole-string trigram score above `TYPED_SEARCH_MIN_SIMILARITY`.
`matchProduct` deliberately still score raw `name`: margin rule tuned on
OCR strings.

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
product row. **Not** AI or gateway lookup. Per-product learned density — no
user-editable density table, no cross-product inference.

One *learned* count unit per product: `learnFromServing` records a single
`serving_unit`/`serving_grams` pair, because that is all a label ever teaches.
Portions are a second layer above it — see below.

## Portions, chips and recent amounts

A portion is an amount nobody printed on a label: a slice of bread, an EU egg
grade, a cup of cooked rice. Curated, not learned, and layered like this:

- `portions.ts` — gram figures by portion class. **Every new figure goes here,
  never inline at a call site, never in the database.** Each carries a comment
  naming its source, and is edible weight (no shell, no packaging).
- `portion-class.ts` — which class a product is, by `standard_slug` or by
  romanized name. Cup classes are slug-only. Two name matches means no match.
- `resolve-portions.ts` — **the only place portion precedence is decided**.
  Most specific wins: the user's override beats what this product's label
  taught, which beats the class default. Slug beats name for picking the
  class, and a product whose nutrition basis is not `g` gets no portions at
  all. A consumer gets a finished `Portion[]` and never re-merges.
- `portion_overrides` — per-user grams for one label of one product. **Never
  write a portion weight to `products`.** Read it as a correlated
  `jsonb_object_agg` subquery, never a `LEFT JOIN`: one row per label, and a
  join multiplies search results.
- `meal_ingredients.entry_count` / `entry_unit` — what the user actually said,
  beside the resolved `quantity`/`quantity_unit`. Nullable, no backfill.
  **Nutrition maths reads `quantity` only**; these two are for display
  (`quantityText`) and for recents. Every write path that saves or edits an
  amount fills them.
- `recentAmounts` (`features/meals/actions/meals.ts`) — the most recent
  distinct *amounts* for a product, newest first, soft-deleted rows excluded.
  Distinct means the count and unit together, not the unit alone, so 200 g and
  250 g are two chips. `RECENT_AMOUNT_LIMIT` decides how many. Never
  re-resolve the weight; it comes off the stored `quantity`.

Two UI rules fall out of this, both easy to break:

- **One chip row, never two.** A new chip source adds a builder to
  `amount-chips.utils.ts` and merges into the same list (`mergeChips`, recents
  first). Every chip prints its gram weight. Both amount screens — the capture
  step and the cooking-fat sheet — render the same `AmountChips`.
- **A value gets one control.** `unitsForSelect` drops any unit already
  offered as a chip from the unit select, keeping only the unit in play so the
  select can always show its own value.

Re-run `cd app && npm run check:portion-classes` after touching `PortionClass`,
`CLASS_BY_SLUG`, `NAME_TOKENS_BY_CLASS`, `EXCLUDED_TOKENS_BY_CLASS` or
`fixtures/standard-foods.json`. It must exit 0 — a conflict is a portion chip
about to appear on a food nobody measures that way.

## History

One row per day user logged, newest first, paged at `HISTORY_PAGE_SIZE`.
`history.utils.ts` shape rows; query stay one row per logged day.

- **Days between two loaded rows put back client-side** (`withUnloggedDays`),
  never by query. Up to `MAX_GAP_FILL_DAYS` blank days list one row each and
  link to that day — a missed day is somewhere to go, not a hole. Longer
  stretch collapse to one non-linking row. Nothing filled above newest row or
  below oldest: first is day user came from, second may be next page.
- Rows group by month (`toHistoryMonths`), heading sticky, year dropped inside
  current year.
- Rail on a logged row is day hero `CalorieBar` pair one tier quieter (`h-1`,
  `bg-border` track, `bg-text` fill, `danger` at or past goal). Drawn only with
  a kcal goal, `role="presentation"` — every figure it encode printed above it.
  No accent colour: four accents each own a macro, a day kcal is not one.
- **Today row say `so far`, never "under goal"** — day still being eaten is not
  a day under its goal. `recentAverage` leave today out, same reason, and say
  "logged days" because average of days you logged is not average of days that
  passed.

## Weight goal

Optional. App fully usable without one — nothing gates on it, nothing nags.

- `weight_goals` one row per user, `weight_entries` one reading per **local**
  calendar day (unique index; a re-log replaces, never appends). Deleting a
  goal keeps the readings. All four CHECK constraints are load-bearing: a
  target-mode row carries target + rate and no band, a hold-mode row carries a
  band and neither, `recomp` is true only on a hold row
  (`weight_goals_recomp_hold`), and a cadence is at least one day.
- **Carries no calorie arithmetic, in either direction.** No deficit, no TDEE,
  no suggested intake, not even as an aside. `features/weight/` must not import
  `features/goals/` or the reverse. A rate in kg/week is the user's own wish;
  converting it to kcal would make it the app's advice, which is the one thing
  `goal-sheet.tsx`'s no-reset-chip rule exists to refuse. The arithmetic this
  refuses lives in `features/intake/` (see "Intake estimate"), which may import
  `features/weight/`; the reverse stays banned. Recomp is the one exception,
  and it stays in grams of body weight: `RecompCheckbox`'s helper states a
  published protein range (Morton 2018), and `weight.store.ts`'s
  `writeWeightGoal` calls `startRecompProtein`
  (`features/goals/actions/macro-targets.store.ts`) when a goal saves with
  recomp on. No kcal figure crosses, in either direction. Nothing else joins
  it.
- **Recomp is a tick on holding steady, not a mode.** `weight_goals.recomp`,
  shown as `RecompCheckbox` under the band on the sheet's Hold steady and on
  the estimate's Maintain. Switching to a target drops it. The one figure it
  sets is the protein target below; it changes no weight figure.
- **Saving recomp starts a protein target, never overwrites one.**
  `startRecompProtein` writes `RECOMP_PROTEIN_G_PER_KG` (1.8, inside Morton
  2018's 1.6-2.2) times body weight, in **grams**, and only when
  `macro_target_unit` is null. Grams because the copy promises grams per kg,
  and because a gram target is valid with or without a kcal goal. Both save
  paths reach it through `writeWeightGoal`, so a third caller of that function
  gets the behaviour too. The helper copy says the figure and says Set goal
  changes it - keep the two in step.
- All maths pure in `features/weight/actions/weight.utils.ts`. `weightProgress`
  is the only progress function; `nextCheckinDate` and `checkinCountdown` the
  only cadence ones. A rail share is clamped 0–1 and the text beside it states
  the real figure.
- **Every figure the user picks is typeable; the presets are shortcuts, not
  the range.** Pace, band and cadence each render as one `Field` with a preset
  row under it (`PresetField` in `weight-goal-sheet.tsx`) — the same
  relationship `AmountChips` has with the amount field. A cadence is any whole
  number of days, 1–365; a pace is any figure above zero. The one-week floor
  was dropped 2026-09-21: it was the app deciding for the user, and a daily
  reading being mostly water is a fact the app states rather than smooths.
- **Storage is always kg; the unit is a display preference.**
  `users.weight_unit` (`kg` default, `lb`) decides which unit figures are typed
  and printed in, and it is a column on `user` because it is one field with no
  cross-field invariant — the same call `daily_calorie_goal` makes. Every
  weight column is `numeric` at **two** decimals: 0.1 lb is 0.045 kg, so at one
  decimal a pound reading came back as a pound the user never typed. Conversion
  is `toKg`/`fromKg`/`displayWeight`, and a figure is rounded once, at the copy
  layer, in the unit it prints in. Presets are round numbers **in each unit**
  (0.25 kg/wk vs 0.5 lb/wk), never the kilogram row converted — only a figure
  the user typed themselves is ever converted.
- Row shows on **today** only, below `DayMacros`, one emphasis tier quieter:
  one text line plus an `h-1` rail. **No accent colour in the block** — the
  accents own protein/carbs/fat/log-success. No verdict copy, no chart, no
  card. `danger` appears on exactly one control, the armed `Delete` in the
  row's expanded panel, and only while it is armed — the resting `Delete goal`
  is as quiet as `Edit goal` beside it, and arming fires no request. The sheet
  carries no destructive control at all: a delete a user meets while reading a
  form is one they can hit instead of cancelling.
- Refusals cross to the client as `SaveWeightGoalResult` / `LogWeightResult`,
  not thrown classes — same reasoning as `CreateProductResult`.
- Weigh-in dismissal is per-device `localStorage`
  (`per100:weigh-in-dismissed:<date>`), like the AI-photo consent key. The ✕
  fires no request and does not mark the check-in done, so a daily cadence
  asks again tomorrow. That is the cadence the user chose — there is no
  back-off after repeated dismissals, because counting them would be the app
  deciding they stopped meaning it (rejected 2026-09-21, see `DECISIONS.md`).
- Spec: `docs/superpowers/specs/2026-09-21-weight-goal-design.md`.

## Intake estimate

Optional page at `/calories/estimate`, reached only from `GoalSheet`'s
`Work out the numbers` row. Nothing on the day view points at it.

- All maths pure in `features/intake/actions/intake.utils.ts`, run by the form
  for the live range and again by `saveIntakeEstimate`, which never trusts a
  figure from the browser. Every constant is labelled **published** (with its
  source) or **judgment**; keep that labelling when adding one.
- **Stored only with consent.** `intake_profiles` is written only when the
  consent box is ticked; saving unticked deletes the row, and `Forget these
  details` deletes it too. The consent copy is verbatim once approved — never
  paraphrase it, and bump `CONSENT_VERSION` when it changes. The condition box
  never asks which condition.
- **Not stored:** current weight, goal weight, pace, band, recomp (they live
  in the weight tables), and any derived figure (BMI, FFMI, lean mass,
  timeline, the estimate itself). The one output kept is
  `users.daily_calorie_goal`.
- The Primary goal group says macros exist and where to set them: nothing
  else in this form mentions them, and it only ever sets calories.
- **The goal fields are the weight goal.** A goal weight saves a target goal;
  Maintain's band saves a hold goal (with recomp). No opt-in box. An
  unchanged goal writes nothing, so recalculating never resets its start; a
  band of 0 leaves any goal alone.
- **The disclaimer describes the measured burn, which shipped 2026-09-23.**
  See "Measured burn" below. Sentence is true only while that path stay wired:
  remove feature, cut sentence with it.
- Rails: no estimate under 18 or in pregnancy/breastfeeding; maintenance only
  below BMI 18.5; a deficit floors at `max(BMR, 1200 F / 1500 M)` and never
  above maintenance. A typed pace past the cap is stated, not refused.
- Imports: `intake → weight` and `intake → meals` only. Weight writes it needs
  go through `features/weight/actions/weight.store.ts`, which takes a
  `DbTransaction` and has no `"use server"` — it takes a userId, so exposing it
  as an action would let a browser write any user's rows.
- Refusals cross as `SaveIntakeResult`, never thrown classes.
- Spec: `docs/superpowers/specs/2026-09-21-intake-estimate-design.md`.

### Measured burn

Maintenance worked out from user own logged meals and weight readings, in
place of formula figure. Only surface is `/calories/estimate` Details — no
day-view row, no goal-sheet line. PRODUCT.md say app advise intake in exactly
one place; that sentence is why.

- Maths pure in `features/intake/actions/measured-burn.utils.ts`. Least
  squares over every reading in window. Slope standard error and intake mean
  standard error add in quadrature; that sigma is both the range width and the
  refusal threshold, so neither is magic number.
- **Every logged day count, unjudged.** Forgotten dinner stay in. No
  plausibility floor, no "day complete" tick, no exclusion list. Judging a day
  is app deciding what user meant — same move DECISIONS.md refuse on weigh-in
  dismissal back-off. Under-logging bias figure low, and deficit floor alone
  **not** catch it: floor clamp to maintenance (never suggest eating more than
  you burn), so it follow bad figure down. So `readyEstimate` refuse measured
  figure below user own BMR and formula stand — judge the measurement, never
  the days. Above BMR, `max(BMR, 1200 F / 1500 M)` floor apply as ever.
- Coverage floor require data **exist**, not judge its contents. Unlogged days
  bias the mean, not only widen it.
- Window grow from 14 to 56 days, shortest qualifying one win. Past cap →
  `insufficient`, carrying logged-day count **and** weigh-in count: either can
  be blocker, they fail independent.
- **Nothing stored.** Derived figure, recomputed each read, same rule
  `intake_profiles` follow.
- Measured figure bypass activity factor, body-fat stage and metabolism
  correction — measured burn already contain what they model. BMR still
  computed: deficit floor read it. Every §7 rail still apply.
- Imports: `intake → meals` allowed now, beside `intake → weight`. Reader is
  `features/meals/actions/meals.store.ts`, userId-taking, no `"use server"` —
  same reason `weight.store.ts` carry none.
- Spec: `docs/superpowers/specs/2026-09-23-measured-burn-design.md`.

## Daily goals: kcal goal and macro targets

One sheet (`goal-sheet.tsx`, titled "Daily goals") holds both, and both are
optional and independent. `No calorie goal` removes the kcal goal
(`daily_calorie_goal` null); `Set a calorie goal` brings it back.

- **Macro targets are per macro, each optional.** A blank field is an
  untracked macro, never a zero. Behind an `Add macro targets` row; no
  preset, no default, same reasoning as the no-2000 chip. Recomp is the one
  thing that fills a target unasked - see "Weight goal".
- **Unit follows the kcal goal.** A share of kcal (`pct`) when there is one,
  grams when there is not. Removing or restoring the goal in the sheet
  converts the figures field by field (`convertTargetsDraft`), never wipes
  them. Stored grams beside a goal stay grams - the estimate can set a goal
  under existing gram targets and that row stays valid.
- Columns `users.macro_target_unit` + `macro_protein/carbs/fat` (smallint),
  four CHECKs: unit set exactly when a macro is; nothing negative; shares fit
  in 100 and three shares make exactly 100; a share needs a kcal goal. They
  use `num_nonnulls` and `::int` on purpose - a CHECK that evaluates to NULL
  passes, and Postgres need not short-circuit the OR.
- Maths pure in `features/goals/actions/macro-targets.utils.ts`. kcal and
  grams bridge only through `KCAL_PER_GRAM` (Atwater 4/4/9, published).
  `gramTargets` is the one place a share becomes grams.
- Day view: no targets, the gram-share composition bar as before; targets,
  one column per macro with "of Xg" and a rail, "no target" for an untracked
  one, shown on an empty day too. No danger colour past a target.
- Targets that do not read block the whole Save, goal included.
  `saveDailyGoals(goal | null, targets | null)` writes everything in one UPDATE.

## Time

Day boundaries are user's **local** calendar day (browser IANA timezone,
per request), never server's UTC day.

**`meals.log_date` is day a meal counts towards.** Browser's local calendar
date when meal started, stored, never derived from `created_at`. Every day read
filter on it: `getDayLog`, `getDayHistory`, `dailyKcalTotals`, meal numbering.
`created_at` now mean only "when row written" — ordering inside a day,
`recentAmounts`, soft-delete sweep.

Stored, not derived, because meal eaten yesterday can be entered today and a
timestamp cannot tell two apart. Falls out of that: a day read same wherever
reader is, so flying between zones no longer move meal to day before.

`createMeal(logDate, timezone)` refuse future date (`InvalidLogDateError`),
never refuse past one. Screen that start a meal pass day on screen.

**Every day user can reach is loggable.** Day view bottom bar middle slot
always `NewMealButton`; label name day when not today ("New meal for
yesterday"). Way back to today is header day label, which say which day open in
same breath — no separate "Back to today" control.

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
  exempt), no silently swallowed errors, `components/ui/`↔`features/` and
  `lib/`↔`features/`/`app/` import-direction boundaries (Rule 20). Framework
  entry points (`page.tsx`, `layout.tsx`, `route.ts`) and tool-loaded configs
  (`drizzle.config.ts`, `vitest.config.ts`, `next.config.ts`,
  `eslint.config.mjs`) keep their default exports — compliant, not finding.
- **Named error types are judgment-only, not linted.** A named class earns
  its keep only where something discriminates on it. This section used to
  claim production code discriminated exactly one, `BarcodeAlreadyLinkedError`
  in `confirm-step.tsx` — false even before 2026-09-20, and not just stale:
  a Server Action's thrown error reaches a client component as a plain
  `Error`, subclass identity and every custom property stripped, so that
  `instanceof` check was always `false` and that branch never fired.
  Production code discriminates three now — `BarcodeAlreadyLinkedError`,
  `DuplicateProductError`, `SameFiguresError` — all by `instanceof`, all
  inside `products.ts` only, which is what keeps `instanceof` reliable: the
  throw never leaves that module. `createProduct` maps each to
  `CreateProductResult`, and `confirm-step.tsx` discriminates that union's
  `kind` instead, never a class — see "Same figures, same product" above.
  Tests discriminate seven more via `.rejects.toThrow`, which is also a
  reason to name one. Of 19 classes in `app/src`, nine go undiscriminated
  anywhere. Name a failure when a caller or test must tell it apart from its
  siblings — but when that caller is a Server Action's client component,
  name a result-union member, not an error class, or the name never survives
  the trip. Leave a bare `throw new Error` for boot-time invariants nothing
  can catch (missing env var in `lib/s3.ts`, `lib/db/index.ts`,
  `lib/ocr/http-provider.ts`). A blanket ESLint ban was considered and
  rejected 2026-09-17: it cannot see which throws are domain failures.
- Impure/heavy deps sit behind env-var-selected interface: `OCR_PROVIDER`
  and `QUANTITY_PROVIDER` pick real vs mock. `.env.example` default both to
  `mock` — real deployment must set them or every photo return canned
  result silently.
- Refactor passes add **no new production files** — extractions stay in
  same file (a `use<Thing>` hook, standalone handler, subcomponent).
- `StepView` (`capture-wizard.tsx`) use a `switch`, never `Record` lookup —
  TypeScript narrow discriminated union per `switch` case, not through
  object lookup without unsafe cast.
- `wizardReducer` carry repo's only `eslint-disable-next-line complexity`
  directive: exhaustive switch over discriminated union score one per case, and
  splitting table to clear threshold hide state map. Every case needing real
  work already delegate to named `render*`/`apply*` function. `StepView` carried
  second until barcode entry stopped being a step of its own (2026-09-19) and it
  dropped under threshold — don't add second disable back without that argument.
  Directive must be **last** line before code — justification comment after it
  disable nothing and report "Unused eslint-disable directive".
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
- Some client-side specs fail when run **alone** with
  `npx vitest run <one file>` — `Cannot find module 'next/server' imported
  from next-auth/lib/env.js`, an ESM resolution artifact, not a broken test.
  `amount-step.test.ts` is one. Run the suite, or a directory, instead of
  chasing it.
- `app/playwright.config.ts` has an explicit `testMatch` allowlist. **A new
  spec file must be added to it**, or it collects as "No tests found" and the
  suite still passes. `workers: 1` / `fullyParallel: false` because every spec
  truncates the same Postgres tables.

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

M0–M3, app redesign + quick-log, Warm Tactile re-theme, deterministic
nutrition pipeline, and direct-Gemini switch (OmniRoute removed) all shipped.

Since then, shipped as playbooks under `docs/superpowers/plans/`: typed product
search + truthful provenance + per-user nutrition overrides (2026-09-17), then
the portion stack (2026-09-18, playbooks 01–05) — portion engine, class
resolution, the quick-amount chip row, per-user portion gram overrides, and
recent amounts with the entry echo on `meal_ingredients`. Cooking fats got the
same chip row 2026-09-19.

Playbook 06 (`2026-09-18-06-cup-measure.md`) shipped 2026-09-19: `cup` is
offered wherever a density is genuinely known.

Photo and product identity shipped 2026-09-20 (plan and spec deleted once
shipped; recover from git history): content-addressed label-photo keys, the two-tier
same-figures gate, and duplicate suggestions on an Open Food Facts hit — see
"One label photo, one product" and "Same figures, same product" above. A
duplicate is now caught at write time on every entry path. Merging duplicates
already stored is a separate, unstarted concern: no production data exists
yet, so no merge tool was built — reconsider once there is one to merge.

The weight goal shipped 2026-09-21 (`docs/superpowers/plans/2026-09-21-weight-goal.md`):
an optional target-or-hold goal with a weigh-in cadence, one quiet row on
today below the macros — see "Weight goal" above. It carries no calorie
arithmetic in either direction, by design.

The calorie estimate shipped 2026-09-21
(`docs/superpowers/plans/2026-09-21-intake-estimate.md`): an optional form
that works out a daily kcal range and sets the goal on request — see "Intake
estimate" above.

Logging for an earlier day shipped 2026-09-23: `meals.log_date` (migration
`0022`) replace the ingredient-timestamp derivation, every day read filter on
it, and day view bottom bar log to whichever day is open — see "Time" above.
History page redesigned same day: month groups, goal rail per row, days with
nothing logged listed as their own rows — see "History" above.

The measured burn shipped 2026-09-23
(`docs/superpowers/plans/2026-09-23-measured-burn.md`): the estimate now works
maintenance out from user own logs and weigh-ins when data support it — see
"Measured burn" above. Before launch (M4) estimate still need lawyer-reviewed
consent copy, app-wide privacy policy and terms, and consent for
`weight_entries`, which already hold health data (spec §13.3).

Every playbook under `docs/superpowers/plans/` is now done. **M4 — provision
cloud — next, not started.**

### Known gap: no *photo* path for unpackaged food

Narrower than it was. A loose egg, potato or apple is loggable today: the
"Whole food, no packaging" step searches 212 curated standard rows
(`fixtures/standard-foods.json`), and the portion stack gives them tappable
amounts — an egg by grade, rice by the cup. Typing the name is the whole cost.

What is still missing is reading an unpackaged food from a photo. The product
DB's photo path is still OCR'd packaging text only, so a food with no label
cannot be captured by camera, and a food outside the curated 212 cannot be
captured at all. Gemini vision's unique value is exactly this case and it is
still **unmeasured** — no `fixtures/photos/` entry shows unpackaged food. Own
design pass before M4.