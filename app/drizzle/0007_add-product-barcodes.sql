CREATE TYPE "public"."nutrition_origin" AS ENUM('label_photo', 'manual', 'open_food_facts');--> statement-breakpoint
CREATE TABLE "product_barcodes" (
	"barcode" text PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "nutrition_origin" "nutrition_origin" DEFAULT 'label_photo' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_barcodes_product_id_idx" ON "product_barcodes" USING btree ("product_id");