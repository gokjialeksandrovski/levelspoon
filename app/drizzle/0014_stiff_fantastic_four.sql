-- Fails with "could not create unique index ... duplicate key" on any dev DB
-- seeded before this migration under a shared literal photo key (e.g.
-- test/placeholder.jpg across multiple rows). Run `npm run db:reset` instead
-- of `db:migrate` on such a DB - there is no backfill/re-key script, and
-- none is wanted (no production data exists yet).
ALTER TABLE "product_overrides" ADD CONSTRAINT "product_overrides_nutrition_photo_key_unique" UNIQUE("nutrition_photo_key");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_nutrition_photo_key_unique" UNIQUE("nutrition_photo_key");