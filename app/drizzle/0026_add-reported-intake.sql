CREATE TYPE "public"."weight_trend" AS ENUM('steady', 'down', 'up');--> statement-breakpoint
ALTER TABLE "intake_profiles" ADD COLUMN "current_intake_kcal" smallint;--> statement-breakpoint
ALTER TABLE "intake_profiles" ADD COLUMN "weight_trend" "weight_trend";--> statement-breakpoint
ALTER TABLE "intake_profiles" ADD COLUMN "weight_trend_kg_per_week" numeric(4, 2);--> statement-breakpoint
ALTER TABLE "intake_profiles" ADD CONSTRAINT "intake_current_intake" CHECK ("intake_profiles"."current_intake_kcal" IS NULL OR "intake_profiles"."current_intake_kcal" BETWEEN 500 AND 10000);--> statement-breakpoint
ALTER TABLE "intake_profiles" ADD CONSTRAINT "intake_weight_trend_pair" CHECK (("intake_profiles"."current_intake_kcal" IS NULL) = ("intake_profiles"."weight_trend" IS NULL));--> statement-breakpoint
ALTER TABLE "intake_profiles" ADD CONSTRAINT "intake_weight_trend_rate" CHECK (("intake_profiles"."weight_trend_kg_per_week" IS NOT NULL) = ("intake_profiles"."weight_trend" IS NOT NULL AND "intake_profiles"."weight_trend" <> 'steady'));