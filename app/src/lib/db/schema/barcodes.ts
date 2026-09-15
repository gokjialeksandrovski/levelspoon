import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { products } from "./nutrition";

// Barcode is the PK, not a column on products: the same product at a
// different pack size (500g vs 1kg) carries 2 GTINs but 1 nutrition
// profile - a table maps many barcodes to one product (spec §3, §4).
export const productBarcodes = pgTable(
  "product_barcodes",
  {
    barcode: text("barcode").primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("product_barcodes_product_id_idx").on(table.productId)],
);
