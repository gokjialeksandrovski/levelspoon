# Goals

Rules for daily kcal goal, macro targets, weight goal, intake estimate and measured burn. All optional and independent: app fully usable with none set; nothing gates on them, nothing nags.

Import directions:

| From | May import | Never |
|---|---|---|
| `features/weight/` | `features/goals/actions/macro-targets.store.ts` (`startRecompProtein` only) | anything else in `features/goals/`, `features/intake/` |
| `features/goals/` | — | `features/weight/` |
| `features/intake/` | `features/weight/` (via `weight.store.ts`), `features/meals/` (via `meals.store.ts`) | — |

## Daily goals: kcal goal and macro targets

One sheet (`goal-sheet.tsx`, titled "Daily goals") holds both. `No calorie goal` removes the kcal goal (`daily_calorie_goal` null); `Set a calorie goal` brings it back. No default and no reset-to-2000 chip: a flat number on a button would be app recommending an intake.

- **Macro targets per macro, each optional.** Blank field is an untracked macro, never zero. Behind an `Add macro targets` row; no preset, no default. Recomp is the one thing that fills a target unasked (see Weight goal).
- **Unit follows kcal goal.** Share of kcal (`pct`) when there is one, grams when not. Removing or restoring the goal in the sheet converts figures field by field (`convertTargetsDraft`), never wipes them. Stored grams beside a goal stay grams: the estimate can set a goal under existing gram targets and the row stays valid.
- Columns `users.macro_target_unit` + `macro_protein/carbs/fat` (smallint), four CHECKs: unit set exactly when a macro is; nothing negative; shares fit in 100 and three shares make exactly 100; a share needs a kcal goal. They use `num_nonnulls` and `::int` on purpose: a CHECK evaluating to NULL passes, and Postgres need not short-circuit the OR.
- Maths pure in `features/goals/actions/macro-targets.utils.ts`. kcal and grams bridge only through `KCAL_PER_GRAM` (Atwater 4/4/9, published). `gramTargets` is the one place a share becomes grams.
- Day view: no targets → gram-share composition bar; targets → one column per macro with "of Xg" and a rail, "no target" for an untracked one, shown on an empty day too. No danger colour past a target.
- Targets that do not parse block the whole Save, goal included. `saveDailyGoals(goal | null, targets | null)` writes everything in one UPDATE.
- No fibre target: fibre is not a share of kcal (`DECISIONS.md`).

## Weight goal

- `weight_goals` one row per user; `weight_entries` one reading per **local** calendar day, derived server-side from browser timezone, never server UTC, never client-supplied date. Unique index is the one-reading-per-day rule: re-log replaces, never appends. Deleting a goal keeps readings.
- Four load-bearing CHECKs on `weight_goals`: target-mode row carries target + rate and no band; hold-mode row carries a band and neither; `recomp` true only on a hold row (`weight_goals_recomp_hold`); cadence ≥ 1 day.
- **No calorie arithmetic, either direction.** No deficit, no TDEE, no suggested intake, not even as an aside. A rate in kg/week is user's own wish; converting it to kcal makes it app advice. That arithmetic lives in `features/intake/`.
- **Recomp is a tick on holding steady, not a mode.** `weight_goals.recomp`, shown as `RecompCheckbox` under the band on sheet's Hold steady and estimate's Maintain. Switching to a target drops it. Changes no weight figure. Its helper copy states a published protein range (Morton 2018): the one advice sentence in this feature.
- **Saving recomp starts a protein target, never overwrites one.** `writeWeightGoal` (`weight.store.ts`) calls `startRecompProtein` (`features/goals/actions/macro-targets.store.ts`), which writes `RECOMP_PROTEIN_G_PER_KG` (1.8, inside Morton's 1.6–2.2) × body weight, in **grams**, only when `macro_target_unit` is null. Grams because copy promises grams per kg and a gram target is valid with or without a kcal goal. Both save paths go through `writeWeightGoal`, so any third caller gets it too. Helper copy states the figure and says Set goal changes it: keep the two in step. No kcal figure crosses.
- All maths pure in `features/weight/actions/weight.utils.ts`, never in a component or Server Action body. `weightProgress` only progress function (new shape adds a `WeightProgress` variant); `nextCheckinDate` and `checkinCountdown` only cadence ones. Rail share clamped 0–1; text beside it states real figure. File never imports `features/goals/` and never computes, mentions or returns a calorie figure.
- **Every figure is typeable; presets are shortcuts, not the range.** Pace, band and cadence each render as one `Field` with a preset row under it (`PresetField`, `weight-goal-sheet.tsx`), same relationship `AmountChips` has with the amount field. Cadence: any whole number of days 1–365. Pace: any figure above zero. A daily reading being mostly water is a fact app states, not smooths.
- **Storage always kg; unit is display preference.** `users.weight_unit` (`kg` default, `lb`): column on `user` because one field, no cross-field invariant (same call as `daily_calorie_goal`). Every weight column `numeric` at **two** decimals: 0.1 lb is 0.045 kg, so one decimal returns a pound reading user never typed. Conversion only via `toKg`/`fromKg`/`displayWeight`; figure rounded **once**, at copy layer, in the unit it prints in. Presets are round numbers **in each unit** (0.25 kg/wk vs 0.5 lb/wk): step constant plus `presetsFrom`, never the kg row converted. Only a figure user typed is ever converted.
- Row (`weight-row.tsx`, copy builders in `weight-row.utils.ts`) shows on **today** only, below `DayMacros`, one emphasis tier quieter: one text line + `h-1` rail. **No accent colour in the block.** No verdict copy on pace, no chart, no card. Never format a weight figure inline; every builder takes display unit.
- `danger` on exactly one control: armed `Delete` in row's expanded panel, only while armed. Resting `Delete goal` as quiet as `Edit goal`; arming fires no request; `Cancel` un-arms. Setup sheet carries no destructive control: a delete met while reading a form gets hit instead of cancelling.
- Refusals cross as `SaveWeightGoalResult` / `LogWeightResult`.
- Weigh-in dismissal per-device `localStorage` (`levelspoon:weigh-in-dismissed:<date>`). ✕ fires no request and does not mark check-in done, so daily cadence asks again tomorrow. No back-off after repeated dismissals (`DECISIONS.md`).
- Spec: `docs/specs/2026-09-21-weight-goal-design.md`.

## Intake estimate

Optional page `/calories/estimate`, reached only from `GoalSheet`'s `Work out the numbers` row. Nothing on day view points at it. Only place app advises an intake (`PRODUCT.md`).

- Maths pure in `features/intake/actions/intake.utils.ts`, run by form for live range and again by `saveIntakeEstimate`, which never trusts a browser figure. Every constant labelled **published** (with source) or **judgment**; keep labelling when adding one.
- **Stored only with consent.** `intake_profiles` written only when consent box ticked; saving unticked deletes the row, `Forget these details` deletes it too. Consent copy verbatim once approved, never paraphrase; bump `CONSENT_VERSION` when it changes. Condition box never asks which condition.
- **Not stored:** current weight, goal weight, pace, band, recomp (in weight tables), and any derived figure (BMI, FFMI, lean mass, timeline, the estimate). One output kept: `users.daily_calorie_goal`.
- Primary goal group says macros exist and where to set them; nothing else in the form mentions them, and form only ever sets calories.
- **Goal fields are the weight goal.** Goal weight saves a target goal; Maintain's band saves a hold goal (with recomp). No opt-in box. Unchanged goal writes nothing, so recalculating never resets its start; band 0 leaves any goal alone. Weight writes go through `features/weight/actions/weight.store.ts` (takes `DbTransaction`, no `"use server"`).
- Disclaimer describes measured burn. True only while that path stays wired: remove the feature, cut the sentence.
- Rails: no estimate under 18 or in pregnancy/breastfeeding; maintenance only below BMI 18.5; deficit floors at `max(BMR, 1200 F / 1500 M)` and never above maintenance. Typed pace past cap is stated, not refused.
- **Typed intake is second maintenance source.** `current_intake_kcal` + `weight_trend` (+ `weight_trend_kg_per_week` for down/up only), stored only with consent; three CHECKs keep them paired. Maintenance = intake ± rate · `KCAL_PER_KG` / 7. `resolveMaintenance` precedence: measured > reported > formula. Reported figure below BMR refused (under-report, not a body). Band 15% of figure (judgment, open study). Skips activity factor and metabolism correction. Details always name winning source and say why typed figure went unused. Empty intake sends no trend: never silent fallback on half an answer.
- Refusals cross as `SaveIntakeResult`.
- Spec: `docs/specs/2026-09-21-intake-estimate-design.md`.

### Measured burn

Maintenance worked out from user's own logged meals and weigh-ins, in place of formula. Only surface: `/calories/estimate` Details. No day-view row, no goal-sheet line.

- Maths pure in `features/intake/actions/measured-burn.utils.ts`. Least squares over every reading in window. Slope standard error and intake-mean standard error add in quadrature; that sigma is both range width and refusal threshold, so neither is a magic number.
- **Every logged day counts, unjudged.** Forgotten dinner stays in. No plausibility floor, no "day complete" tick, no exclusion list. Under-logging biases figure low, and deficit floor does **not** catch it (floor clamps to maintenance, so follows bad figure down). So `readyEstimate` refuses a measured figure below user's own BMR and formula stands: judge the measurement, never the days. Above BMR, `max(BMR, 1200 F / 1500 M)` floor applies.
- Coverage floor requires data **exist**, never judges contents. Unlogged days bias the mean, not only widen it.
- Window grows 14 → 56 days, shortest qualifying wins. Past cap → `insufficient`, carrying logged-day count **and** weigh-in count: either can block, they fail independently.
- **Nothing stored.** Recomputed each read.
- Measured figure bypasses activity factor, body-fat stage and metabolism correction (measured burn already contains them). BMR still computed: deficit floor reads it. Every spec §7 rail still applies.
- Meal reads via `features/meals/actions/meals.store.ts` (userId-taking, no `"use server"`).
- Spec: `docs/specs/2026-09-23-measured-burn-design.md`.
