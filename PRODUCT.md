# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One primary user: person logging what they eat, on a phone, one-handed, mid-meal
or straight after. Multi-user app, but no social, sharing or coach role — each
account is one person's own log. Products are shared cross-user; logs are not.

## Product Purpose

Log meals built from ingredients. Every product stores nutrition per 100 g (or
100 ml); every consumed amount computes from that base. Success is a meal logged
in seconds without typing nutrition figures by hand — photo/OCR, barcode, or a
curated standard-food search does the reading.

## Positioning

Nutrition figures stay deterministic. OCR, parsing and rule-based validation
read the label. An LLM has two jobs: estimating amount eaten from a photo, and
lazy track — a rough, itemized estimate of a described meal the user asks for,
labelled as an estimate, kept private to that user, never written to a shared
row. Shared crowd-sourced product table with per-user override, so a correction
never silently rewrites another user's figures.

The app states figures. It advises intake in exactly one place, on request:
the calorie estimate (`/calories/estimate`), which shows a range from
published formulas with its working and its uncertainty. One sentence of
advice sits beside it on purpose: the Recomp tick states a published protein
range. No diet plan, no nudge to run the estimate, and nothing else in the
app names an intake.

## Operating Context

Phone, one hand, kitchen or restaurant, often poor light and a crumpled label.
Day boundaries are the user's local calendar day. Home page is the day view:
kcal total, macro split, meal list, and a sticky "New meal" bar within thumb
reach. Weeks-scale review happens on `/history`.

## Capabilities and Constraints

- Product discovery: label photo + OCR, barcode (internal DB first, Open Food
  Facts fallback), curated standard-food search (232 rows), manual entry.
- Recipes: a meal the user saved to re-add later, private to that user.
  Saved from the meal page, picked from the capture wizard's `Add a meal`
  section; no standalone recipes page. Stores amounts only; every total reads
  live nutrition, so a corrected label moves every recipe. Retro-update of
  earlier identical meals is today-only. See `docs/MEALS.md`.
- Lazy track: user describes a meal (optional photo), Gemini returns an
  itemized estimate, user fixes grams on a review step, then logs. Guesses
  land on private `ai_estimate` product rows: never shared, searched, matched,
  barcode-linked or label-proved. Reuse only through recipes, tagged as an
  estimate. Least accurate logging path on purpose. See `docs/MEALS.md`.
- Daily calorie goal: optional, hand-set, per user (`users.daily_calorie_goal`,
  null until set). App offers no default and no reset-to-2000 chip — a flat
  number on a button would be the app recommending an intake.
- Macro targets: optional, per macro, hand-set on the goal sheet, no preset.
  A share of daily kcal when a kcal goal is set, grams when not; the kcal
  goal itself can be removed. Shown on the day view as gram targets.
- Calorie estimate: optional form reached only from the
  goal sheet; Mifflin-St Jeor or Katch-McArdle, standard activity factors,
  shown as a range that narrows with each answer. A goal weight saves a
  target weight goal; Maintain's band saves a hold goal, optionally with
  Recomp. Answers stored only with explicit consent (`intake_profiles`). See
  `docs/superpowers/specs/2026-09-21-intake-estimate-design.md`.
- Measured calorie burn: when a user has logged meals and
  weighed in for long enough, the estimate works their maintenance out from
  those rows by energy balance instead of from the formula, and says so. Too
  little or too noisy data and it says that instead of guessing. Shown only in
  the estimate's Details; nothing is stored. See
  `docs/superpowers/specs/2026-09-23-measured-burn-design.md`.
- Amounts: grams, millilitres, learned label servings, curated portion classes
  (a slice, an egg grade, a cup where density is genuinely known), and recent
  amounts per product.
- Weight tracking: optional; app fully usable without it.
  Deliberately carries no arithmetic to or from the calorie goal — see
  `docs/superpowers/specs/2026-09-21-weight-goal-design.md`. Stored in kg
  always; `users.weight_unit` picks kg or lb for entry and display. Pace, band
  and weigh-in cadence are each a typed figure with preset shortcuts — no
  fixed set, and no floor above one day.
- Postgres `numeric` for every nutrition column, never `real`.
- Auth.js v5 credentials + JWT sessions. No cloud services in dev (local
  Postgres + MinIO stand in for Neon + R2).
- Terminology: *product* (a row in the shared per-100 g table), *ingredient*
  (a product plus an amount inside a meal), *portion* (a curated gram figure
  nobody printed on a label), *standard food* (a curated unpackaged row).

## Brand Commitments

Name: levelspoon.
Voice: states facts, never coaches. No streaks, no badges, no encouragement
copy, no shame copy. Design system "Warm Tactile Minimal" is settled and
documented in `DESIGN.md`; four accents each carry exactly one semantic role
(protein / carbs / fat / log-success) and are never decorative.

## Evidence on Hand

- `fixtures/` — committed real label photos, OCR boxes, golden per-100 g values.
- `fixtures/standard-foods.json` — 232 curated unpackaged foods.
- `app/src/lib/measures/`, `portions.ts` — measured gram figures, each carrying
  a source comment.
- No user data exists yet in production; nothing is deployed. No customers, no
  benchmarks, no testimonials — none may be invented.

## Product Principles

1. Deterministic where a number is involved. AI only where no deterministic
   answer exists, and never for a shared nutrition figure. The one AI figure
   is a lazy-track estimate the user asked for, labelled and private.
2. State by default. Advise only where the user asks, and show the
   uncertainty. Every figure on screen traces to a label, a measurement, the
   user's own entry, or a named published formula - except the one AI figure
   named in Principle 1, always shown labelled as an estimate.
3. The shared table is the thing worth protecting: refuse a duplicate or a
   reused photo at write time rather than cleaning up later.
4. Optional stays optional. A feature the user has not set up must not block,
   nag, or gate anything else.
5. One hand, one thumb, bottom of the screen.

## Accessibility & Inclusion

Colour never carries meaning alone — every accent-coded element pairs with a
redundant non-colour cue. Computed WCAG/OKLab contrast gate
(`app/src/lib/theme/contrast.ts`) must pass before any colour token ships.
Light and dark themes both real, chosen by `prefers-color-scheme`. Motion
gated behind `prefers-reduced-motion`. 44px minimum tap targets.
