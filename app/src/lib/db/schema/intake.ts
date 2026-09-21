import { sql } from "drizzle-orm";
import { boolean, check, numeric, pgEnum, pgTable, smallint, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";

export const intakeSexEnum = pgEnum("intake_sex", ["male", "female", "unspecified"]);
export const activityLevelEnum = pgEnum("activity_level", ["sedentary", "light", "moderate", "very", "extreme"]);
export const primaryGoalEnum = pgEnum("primary_goal", ["lose_fat", "maintain", "gain_muscle", "recomp"]);
export const bodyFatSourceEnum = pgEnum("body_fat_source", ["typed", "visual"]);
export const trainingStyleEnum = pgEnum("training_style", ["sedentary", "cardio", "strength", "mixed"]);
export const trainingYearsEnum = pgEnum("training_years", ["none", "under_1", "1_to_3", "over_3"]);
export const trackingStyleEnum = pgEnum("tracking_style", ["daily", "weekly_average"]);

// 999.9 cm and 99.9%: one decimal is what a tape or a caliper reads, and the
// app's own ranges (100-250 cm, 3-60%) sit well inside both.
const HEIGHT_PRECISION = 4;
const BODY_FAT_PRECISION = 3;
const ONE_DECIMAL = 1;

// The user's answers, stored only with explicit consent (GDPR Art. 9 - spec
// §13). Current weight, goal weight and pace are not here: the weight
// feature's tables already hold them, and a second copy would drift at the
// next weigh-in. No estimate is stored either - it is a pure function of these
// answers, and the one figure the user chose lives in daily_calorie_goal.
export const intakeProfiles = pgTable(
  "intake_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    sex: intakeSexEnum("sex").notNull(),
    birthYear: smallint("birth_year").notNull(),
    heightCm: numeric("height_cm", { precision: HEIGHT_PRECISION, scale: ONE_DECIMAL }).notNull(),
    activityLevel: activityLevelEnum("activity_level").notNull(),
    primaryGoal: primaryGoalEnum("primary_goal").notNull(),
    bodyFatPct: numeric("body_fat_pct", { precision: BODY_FAT_PRECISION, scale: ONE_DECIMAL }),
    bodyFatSource: bodyFatSourceEnum("body_fat_source"),
    trainingStyle: trainingStyleEnum("training_style"),
    strengthDaysPerWeek: smallint("strength_days_per_week"),
    trainingYears: trainingYearsEnum("training_years"),
    trackingStyle: trackingStyleEnum("tracking_style"),
    pregnantOrBreastfeeding: boolean("pregnant_or_breastfeeding").default(false).notNull(),
    metabolismCondition: boolean("metabolism_condition").default(false).notNull(),
    // Signed percent: + the condition raised metabolism, - lowered it. Which
    // condition is never asked and never stored (spec §5).
    metabolismAdjustPct: smallint("metabolism_adjust_pct"),
    // GDPR Art. 7(1): consent has to be demonstrable, and a later change of
    // wording has to be told apart from the text this user agreed to.
    consentedAt: timestamp("consented_at").notNull(),
    consentVersion: smallint("consent_version").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "intake_body_fat_pair",
      sql`(${table.bodyFatPct} IS NULL) = (${table.bodyFatSource} IS NULL)`,
    ),
    // Mirrors MAX_METABOLISM_ADJUST_PCT in intake.utils.ts. A figure without
    // the box ticked is a figure nobody vouched for.
    check(
      "intake_metabolism_pct",
      sql`${table.metabolismAdjustPct} IS NULL OR (${table.metabolismCondition} AND ${table.metabolismAdjustPct} BETWEEN -30 AND 30 AND ${table.metabolismAdjustPct} <> 0)`,
    ),
    check(
      "intake_strength_days",
      sql`${table.strengthDaysPerWeek} IS NULL OR ${table.strengthDaysPerWeek} BETWEEN 0 AND 7`,
    ),
  ],
);
