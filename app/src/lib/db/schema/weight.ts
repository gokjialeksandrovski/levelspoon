import { sql } from "drizzle-orm";
import { boolean, check, date, integer, numeric, pgEnum, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";

export const weightGoalModeEnum = pgEnum("weight_goal_mode", ["target", "hold"]);

// Every weight is stored in kg whatever unit the user types in, so the column
// carries two decimals even though a scale reads one: 0.1 lb is 0.045 kg, and
// at one decimal a pound reading would snap to a different pound reading on
// the way back out (172.7 lb stored, 172.6 lb redisplayed). Six digits hold
// 9999.99, past any reading the app accepts.
const WEIGHT_COLUMN_PRECISION = 6;
const WEIGHT_COLUMN_SCALE = 2;

// kg/week. Four digits, not three: the pace is a typed figure now, and 9.99
// was a ceiling nobody chose.
const RATE_COLUMN_PRECISION = 4;
const RATE_COLUMN_SCALE = 2;

// Two decimals for the same pound round-trip reason as the weight columns.
const BAND_COLUMN_PRECISION = 4;
const BAND_COLUMN_SCALE = 2;

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
    recomp: boolean("recomp").default(false).notNull(),
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
    // Recomp holds the scale still on purpose; a target moves it.
    check("weight_goals_recomp_hold", sql`${table.mode} = 'hold' OR NOT ${table.recomp}`),
    // Zero days is not a cadence: the next check-in would be the day it was
    // set, forever. The ceiling is the app's, not this column's.
    check("weight_goals_checkin_interval_positive", sql`${table.checkinIntervalDays} >= 1`),
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
