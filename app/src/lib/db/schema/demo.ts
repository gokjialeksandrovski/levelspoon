import { date, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

// One row per counter per day: per-IP demo scans, all demo scans, per-IP
// guest sign-ins. Rows from earlier days are dead weight, never read.
export const demoQuota = pgTable(
  "demo_quota",
  {
    day: date("day").notNull(),
    counter: text("counter").notNull(),
    count: integer("count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.day, table.counter] })],
);
