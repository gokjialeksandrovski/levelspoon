CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."quantity_source" AS ENUM('ai_estimated', 'manual');--> statement-breakpoint
CREATE TABLE "meal_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity_g" numeric(10, 2) NOT NULL,
	"quantity_source" "quantity_source" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"energy_kcal" numeric(10, 2) NOT NULL,
	"fat_g" numeric(10, 2) NOT NULL,
	"saturates_g" numeric(10, 2) NOT NULL,
	"carbohydrate_g" numeric(10, 2) NOT NULL,
	"sugars_g" numeric(10, 2) NOT NULL,
	"protein_g" numeric(10, 2) NOT NULL,
	"salt_g" numeric(10, 2) NOT NULL,
	"nutrition_photo_key" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "meal_ingredients" ADD CONSTRAINT "meal_ingredients_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_ingredients" ADD CONSTRAINT "meal_ingredients_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_name_trgm_idx" ON "products" USING gin ("name" gin_trgm_ops);