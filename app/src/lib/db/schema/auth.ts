import { integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Display preference, not storage: every weight column stays kg, and this
// decides which unit the figures are entered and printed in. One field with
// no cross-field invariant, so it is a column here rather than a row of its
// own - the same call daily_calorie_goal makes.
export const weightUnitEnum = pgEnum("weight_unit", ["kg", "lb"]);

export const users = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"),
  // Null until the user sets one - home page falls back to consumed-only
  // display (no target concept) until then.
  dailyCalorieGoal: integer("daily_calorie_goal"),
  weightUnit: weightUnitEnum("weight_unit").default("kg").notNull(),
});
