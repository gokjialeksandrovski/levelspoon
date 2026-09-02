ALTER TABLE "products" ADD COLUMN "density_g_ml" numeric(6, 4);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "serving_unit" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "serving_grams" numeric(10, 2);