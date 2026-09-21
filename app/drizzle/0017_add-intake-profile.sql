CREATE TYPE "public"."activity_level" AS ENUM('sedentary', 'light', 'moderate', 'very', 'extreme');--> statement-breakpoint
CREATE TYPE "public"."body_fat_source" AS ENUM('typed', 'visual');--> statement-breakpoint
CREATE TYPE "public"."intake_sex" AS ENUM('male', 'female', 'unspecified');--> statement-breakpoint
CREATE TYPE "public"."primary_goal" AS ENUM('lose_fat', 'maintain', 'gain_muscle', 'recomp');--> statement-breakpoint
CREATE TYPE "public"."tracking_style" AS ENUM('daily', 'weekly_average');--> statement-breakpoint
CREATE TYPE "public"."training_style" AS ENUM('sedentary', 'cardio', 'strength', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."training_years" AS ENUM('none', 'under_1', '1_to_3', 'over_3');--> statement-breakpoint
CREATE TABLE "intake_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"sex" "intake_sex" NOT NULL,
	"birth_year" smallint NOT NULL,
	"height_cm" numeric(4, 1) NOT NULL,
	"activity_level" "activity_level" NOT NULL,
	"primary_goal" "primary_goal" NOT NULL,
	"body_fat_pct" numeric(3, 1),
	"body_fat_source" "body_fat_source",
	"training_style" "training_style",
	"strength_days_per_week" smallint,
	"training_years" "training_years",
	"tracking_style" "tracking_style",
	"pregnant_or_breastfeeding" boolean DEFAULT false NOT NULL,
	"metabolism_condition" boolean DEFAULT false NOT NULL,
	"metabolism_adjust_pct" smallint,
	"consented_at" timestamp NOT NULL,
	"consent_version" smallint NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "intake_body_fat_pair" CHECK (("intake_profiles"."body_fat_pct" IS NULL) = ("intake_profiles"."body_fat_source" IS NULL)),
	CONSTRAINT "intake_metabolism_pct" CHECK ("intake_profiles"."metabolism_adjust_pct" IS NULL OR ("intake_profiles"."metabolism_condition" AND "intake_profiles"."metabolism_adjust_pct" BETWEEN -30 AND 30 AND "intake_profiles"."metabolism_adjust_pct" <> 0)),
	CONSTRAINT "intake_strength_days" CHECK ("intake_profiles"."strength_days_per_week" IS NULL OR "intake_profiles"."strength_days_per_week" BETWEEN 0 AND 7)
);
--> statement-breakpoint
ALTER TABLE "intake_profiles" ADD CONSTRAINT "intake_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;