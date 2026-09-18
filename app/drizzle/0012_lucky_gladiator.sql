CREATE TABLE "portion_overrides" (
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"portion_label" text NOT NULL,
	"grams" numeric(10, 2) NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "portion_overrides_user_id_product_id_portion_label_pk" PRIMARY KEY("user_id","product_id","portion_label")
);
--> statement-breakpoint
ALTER TABLE "portion_overrides" ADD CONSTRAINT "portion_overrides_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portion_overrides" ADD CONSTRAINT "portion_overrides_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;