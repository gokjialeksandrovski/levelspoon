CREATE TYPE "public"."weight_goal_mode" AS ENUM('target', 'hold');--> statement-breakpoint
CREATE TABLE "weight_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"measured_on" date NOT NULL,
	"weight_kg" numeric(5, 1) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "weight_entries_user_id_measured_on_unique" UNIQUE("user_id","measured_on")
);
--> statement-breakpoint
CREATE TABLE "weight_goals" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"mode" "weight_goal_mode" NOT NULL,
	"start_weight_kg" numeric(5, 1) NOT NULL,
	"start_date" date NOT NULL,
	"target_weight_kg" numeric(5, 1),
	"rate_kg_per_week" numeric(3, 2),
	"hold_band_kg" numeric(3, 1),
	"checkin_interval_days" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "weight_goals_mode_fields" CHECK (("weight_goals"."mode" = 'target' AND "weight_goals"."target_weight_kg" IS NOT NULL AND "weight_goals"."rate_kg_per_week" IS NOT NULL AND "weight_goals"."hold_band_kg" IS NULL)
       OR ("weight_goals"."mode" = 'hold' AND "weight_goals"."hold_band_kg" IS NOT NULL AND "weight_goals"."target_weight_kg" IS NULL AND "weight_goals"."rate_kg_per_week" IS NULL)),
	CONSTRAINT "weight_goals_target_differs" CHECK ("weight_goals"."mode" = 'hold' OR "weight_goals"."target_weight_kg" <> "weight_goals"."start_weight_kg")
);
--> statement-breakpoint
ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_goals" ADD CONSTRAINT "weight_goals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;