ALTER TABLE "products" ADD COLUMN "name_search" text NOT NULL DEFAULT '';--> statement-breakpoint
-- Existing rows are backfilled with lower(name): right for every ASCII name,
-- and a non-ASCII one is no worse off than it was before the column existed.
-- Rewriting it properly needs the app's transliteration, so a re-seed or a
-- rename is what fixes those.
UPDATE "products" SET "name_search" = lower("name");--> statement-breakpoint
-- The default was only ever scaffolding for the backfill: a writer that
-- forgets the column should fail loudly, not file an unfindable row.
ALTER TABLE "products" ALTER COLUMN "name_search" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "products_name_search_trgm_idx" ON "products" USING gin ("name_search" gin_trgm_ops);
