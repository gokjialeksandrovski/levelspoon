CREATE TYPE "public"."product_category" AS ENUM('whole', 'fat');--> statement-breakpoint
CREATE TYPE "public"."product_source" AS ENUM('user', 'standard');--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "nutrition_photo_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "source" "product_source" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "standard_slug" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "standard_category" "product_category";--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_standard_slug_unique" UNIQUE("standard_slug");