CREATE TABLE "product_overrides" (
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"energy_kcal" numeric(10, 2) NOT NULL,
	"fat_g" numeric(10, 2) NOT NULL,
	"saturates_g" numeric(10, 2) NOT NULL,
	"carbohydrate_g" numeric(10, 2) NOT NULL,
	"sugars_g" numeric(10, 2) NOT NULL,
	"protein_g" numeric(10, 2) NOT NULL,
	"salt_g" numeric(10, 2) NOT NULL,
	"nutrition_photo_key" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_overrides_user_id_product_id_pk" PRIMARY KEY("user_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "product_overrides" ADD CONSTRAINT "product_overrides_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_overrides" ADD CONSTRAINT "product_overrides_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;