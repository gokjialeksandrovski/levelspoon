CREATE TYPE "public"."macro_target_unit" AS ENUM('pct', 'g');--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "macro_target_unit" "macro_target_unit";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "macro_protein" smallint;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "macro_carbs" smallint;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "macro_fat" smallint;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_macro_targets_unit" CHECK (("user"."macro_target_unit" IS NULL) = (num_nonnulls("user"."macro_protein", "user"."macro_carbs", "user"."macro_fat") = 0));--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_macro_targets_non_negative" CHECK (coalesce("user"."macro_protein", 0) >= 0 AND coalesce("user"."macro_carbs", 0) >= 0 AND coalesce("user"."macro_fat", 0) >= 0);--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_macro_targets_pct_whole" CHECK ("user"."macro_target_unit" IS DISTINCT FROM 'pct'
      OR (coalesce("user"."macro_protein", 0)::int + coalesce("user"."macro_carbs", 0) + coalesce("user"."macro_fat", 0) <= 100
        AND (num_nonnulls("user"."macro_protein", "user"."macro_carbs", "user"."macro_fat") < 3
          OR "user"."macro_protein"::int + "user"."macro_carbs" + "user"."macro_fat" = 100)));--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_macro_targets_pct_needs_goal" CHECK ("user"."macro_target_unit" IS DISTINCT FROM 'pct' OR "user"."daily_calorie_goal" IS NOT NULL);