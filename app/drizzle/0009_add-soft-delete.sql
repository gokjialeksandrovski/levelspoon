ALTER TABLE "meal_ingredients" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "meals" ADD COLUMN "deleted_at" timestamp;