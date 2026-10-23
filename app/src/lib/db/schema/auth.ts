import { sql } from "drizzle-orm";
import { boolean, check, integer, pgEnum, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Display preference, not storage: every weight column stays kg, and this
// decides which unit the figures are entered and printed in. One field with
// no cross-field invariant, so it is a column here rather than a row of its
// own - the same call daily_calorie_goal makes.
export const weightUnitEnum = pgEnum("weight_unit", ["kg", "lb"]);

// A share of the kcal goal, or grams. Null when no macro is tracked.
export const macroTargetUnitEnum = pgEnum("macro_target_unit", ["pct", "g"]);

export const users = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"),
  // Demo-mode user: no password, placeholder email, signed in through the
  // "guest" provider. Every action runs on the row unchanged; the few that
  // would share data or spend money refuse it (lib/auth/require-user.ts).
  isGuest: boolean("is_guest").default(false).notNull(),
  // Null until the user sets one - home page falls back to consumed-only
  // display (no target concept) until then.
  dailyCalorieGoal: integer("daily_calorie_goal"),
  weightUnit: weightUnitEnum("weight_unit").default("kg").notNull(),
  // Hand-set macro targets, each optional: a null macro is not tracked. On
  // this row rather than a table of their own because every invariant below is
  // a CHECK over this row, including the one tying shares to the kcal goal.
  macroTargetUnit: macroTargetUnitEnum("macro_target_unit"),
  macroProtein: smallint("macro_protein"),
  macroCarbs: smallint("macro_carbs"),
  macroFat: smallint("macro_fat"),
}, (table) => [
  // num_nonnulls rather than IS NULL chains: a CHECK that evaluates to NULL
  // passes, and any arithmetic over a null column goes NULL.
  check(
    "user_macro_targets_unit",
    sql`(${table.macroTargetUnit} IS NULL) = (num_nonnulls(${table.macroProtein}, ${table.macroCarbs}, ${table.macroFat}) = 0)`,
  ),
  check(
    "user_macro_targets_non_negative",
    sql`coalesce(${table.macroProtein}, 0) >= 0 AND coalesce(${table.macroCarbs}, 0) >= 0 AND coalesce(${table.macroFat}, 0) >= 0`,
  ),
  // Shares fit in the whole day, and three shares fill it. ::int because
  // Postgres need not short-circuit the OR, and three gram-sized smallints
  // summed as smallint overflow.
  check(
    "user_macro_targets_pct_whole",
    sql`${table.macroTargetUnit} IS DISTINCT FROM 'pct'
      OR (coalesce(${table.macroProtein}, 0)::int + coalesce(${table.macroCarbs}, 0) + coalesce(${table.macroFat}, 0) <= 100
        AND (num_nonnulls(${table.macroProtein}, ${table.macroCarbs}, ${table.macroFat}) < 3
          OR ${table.macroProtein}::int + ${table.macroCarbs} + ${table.macroFat} = 100))`,
  ),
  // A share of no goal has no grams.
  check(
    "user_macro_targets_pct_needs_goal",
    sql`${table.macroTargetUnit} IS DISTINCT FROM 'pct' OR ${table.dailyCalorieGoal} IS NOT NULL`,
  ),
]);
