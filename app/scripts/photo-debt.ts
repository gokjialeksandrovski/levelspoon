import { writeFile } from "node:fs/promises";

import { fetchPhotoDebt } from "../src/lib/db/photo-debt";

// Relative to this file, not the working directory: pnpm runs it with cwd=app/,
// but the report belongs at the repo root where it is easy to open.
const REPORT_URL = new URL("../../product-photo-debt.json", import.meta.url);

const main = async () => {
  const products = await fetchPhotoDebt();
  await writeFile(REPORT_URL, `${JSON.stringify({ generatedAt: new Date(), products }, null, 2)}\n`, "utf8");
  console.log(`Wrote ${products.length} product(s) to product-photo-debt.json`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
