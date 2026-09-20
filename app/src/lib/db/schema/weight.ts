import { sql } from "drizzle-orm";
import { check, date, integer, numeric, pgEnum, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";

export const weightGoalModeEnum = pgEnum("weight_goal_mode", ["target", "hold"]);

// One decimal is the precision a bathroom scale reads to; a stored 78.43 would
// be a figure no scale showed. 5 digits total holds 999.9 kg, past any reading
// the app accepts.
const WEIGHT_COLUMN_PRECISION = 5;
const WEIGHT_COLUMN_SCALE = 1;

// kg/week, two decimals: the 0.25 chip needs the second one.
const RATE_COLUMN_PRECISION = 3;
const RATE_COLUMN_SCALE = 2;

const BAND_COLUMN_PRECISION = 3;
const BAND_COLUMN_SCALE = 1;

const weightColumn = (columnName: string) =>
  numeric(columnName, { precision: WEIGHT_COLUMN_PRECISION, scale: WEIGHT_COLUMN_SCALE });

// One row per user, so user_id is the whole key - there is nothing else to
// reference a goal by, and a second concurrent goal has no meaning.
export const weightGoals = pgTable(
  "weight_goals",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id),
    mode: weightGoalModeEnum("mode").notNull(),
    // The weight this goal started from, not the user's lifetime start: a goal
    // set mid-journey owns its own origin, so the rail measures this goal.
    startWeightKg: weightColumn("start_weight_kg").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    targetWeightKg: weightColumn("target_weight_kg"),
    rateKgPerWeek: numeric("rate_kg_per_week", {
      precision: RATE_COLUMN_PRECISION,
      scale: RATE_COLUMN_SCALE,
    }),
    holdBandKg: numeric("hold_band_kg", {
      precision: BAND_COLUMN_PRECISION,
      scale: BAND_COLUMN_SCALE,
    }),
    checkinIntervalDays: integer("checkin_interval_days").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // A half-written goal is unreadable rather than merely odd: a target mode
    // with no target has no rail to draw and no date to project.
    check(
      "weight_goals_mode_fields",
      sql`(${table.mode} = 'target' AND ${table.targetWeightKg} IS NOT NULL AND ${table.rateKgPerWeek} IS NOT NULL AND ${table.holdBandKg} IS NULL)
       OR (${table.mode} = 'hold' AND ${table.holdBandKg} IS NOT NULL AND ${table.targetWeightKg} IS NULL AND ${table.rateKgPerWeek} IS NULL)`,
    ),
    // A target equal to the start weight is a hold. Stored as a target it
    // makes a zero-length rail and a projection that never arrives.
    check(
      "weight_goals_target_differs",
      sql`${table.mode} = 'hold' OR ${table.targetWeightKg} <> ${table.startWeightKg}`,
    ),
  ],
);

// Readings outlive the goal they were taken under - deleting a goal keeps them.
export const weightEntries = pgTable(
  "weight_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** User's local calendar day, never a server UTC day. */
    measuredOn: date("measured_on", { mode: "string" }).notNull(),
    weightKg: weightColumn("weight_kg").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  // One reading per day: three readings in a day describe the scale, not the
  // person, and a re-log is how a typo gets fixed.
  (table) => [unique().on(table.userId, table.measuredOn)],
);
