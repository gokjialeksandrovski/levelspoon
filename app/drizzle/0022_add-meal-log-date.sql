ALTER TABLE "meals" ADD COLUMN "log_date" date;--> statement-breakpoint
-- Backfill from the meal's earliest ingredient, because that timestamp is what
-- the day view filtered on before this column existed, so every existing day
-- total keeps the figure it had. UTC is the only timezone available here; a dev
-- row written near midnight can land a day off, and db:reset is the cure.
UPDATE "meals" m
   SET "log_date" = COALESCE(
         (SELECT MIN(mi."created_at") FROM "meal_ingredients" mi WHERE mi."meal_id" = m."id"),
         m."created_at"
       )::date;--> statement-breakpoint
ALTER TABLE "meals" ALTER COLUMN "log_date" SET NOT NULL;
