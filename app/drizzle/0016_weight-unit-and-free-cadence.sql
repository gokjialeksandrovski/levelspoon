CREATE TYPE "public"."weight_unit" AS ENUM('kg', 'lb');--> statement-breakpoint
ALTER TABLE "weight_entries" ALTER COLUMN "weight_kg" SET DATA TYPE numeric(6, 2);--> statement-breakpoint
ALTER TABLE "weight_goals" ALTER COLUMN "start_weight_kg" SET DATA TYPE numeric(6, 2);--> statement-breakpoint
ALTER TABLE "weight_goals" ALTER COLUMN "target_weight_kg" SET DATA TYPE numeric(6, 2);--> statement-breakpoint
ALTER TABLE "weight_goals" ALTER COLUMN "rate_kg_per_week" SET DATA TYPE numeric(4, 2);--> statement-breakpoint
ALTER TABLE "weight_goals" ALTER COLUMN "hold_band_kg" SET DATA TYPE numeric(4, 2);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "weight_unit" "weight_unit" DEFAULT 'kg' NOT NULL;--> statement-breakpoint
ALTER TABLE "weight_goals" ADD CONSTRAINT "weight_goals_checkin_interval_positive" CHECK ("weight_goals"."checkin_interval_days" >= 1);