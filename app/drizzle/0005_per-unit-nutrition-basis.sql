ALTER TABLE "meal_ingredients" RENAME COLUMN "quantity_g" TO "quantity";--> statement-breakpoint
ALTER TABLE "meal_ingredients" ADD COLUMN "quantity_unit" text DEFAULT 'g' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "nutrition_basis_unit" text DEFAULT 'g' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "nutrition_basis_quantity" numeric(10, 2) DEFAULT '100' NOT NULL;