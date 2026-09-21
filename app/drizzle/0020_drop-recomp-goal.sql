ALTER TABLE "weight_goals" ADD COLUMN "recomp" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "weight_goals" ADD CONSTRAINT "weight_goals_recomp_hold" CHECK ("weight_goals"."mode" = 'hold' OR NOT "weight_goals"."recomp");--> statement-breakpoint
UPDATE "weight_goals" SET "recomp" = true FROM "intake_profiles" WHERE "intake_profiles"."user_id" = "weight_goals"."user_id" AND "intake_profiles"."primary_goal" = 'recomp' AND "weight_goals"."mode" = 'hold';--> statement-breakpoint
ALTER TABLE "intake_profiles" ALTER COLUMN "primary_goal" SET DATA TYPE text;--> statement-breakpoint
UPDATE "intake_profiles" SET "primary_goal" = 'maintain' WHERE "primary_goal" = 'recomp';--> statement-breakpoint
DROP TYPE "public"."primary_goal";--> statement-breakpoint
CREATE TYPE "public"."primary_goal" AS ENUM('lose_fat', 'maintain', 'gain_muscle');--> statement-breakpoint
ALTER TABLE "intake_profiles" ALTER COLUMN "primary_goal" SET DATA TYPE "public"."primary_goal" USING "primary_goal"::"public"."primary_goal";
