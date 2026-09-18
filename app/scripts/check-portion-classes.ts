import { readFileSync } from "node:fs";
import { join } from "node:path";

import { toSearchText } from "../src/lib/db/search-text";
import { portionClassForName, portionClassForSlug } from "../src/lib/measures/portion-class";

interface FixtureRow {
  slug: string;
  name: string;
}

/**
 * Runs both class-resolution routes over every curated food and reports
 * where they disagree.
 *
 * A null name match is always fine - it means the name says nothing and the
 * slug decides. What must never happen is a name match that contradicts the
 * curated table, or invents a class for a row the table deliberately leaves
 * out: that is a portion chip appearing on a food nobody measures that way.
 */
const FIXTURE_PATH = join(import.meta.dirname, "../../fixtures/standard-foods.json");

const rows: FixtureRow[] = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

const conflicts = rows.flatMap((row) => {
  const slugClass = portionClassForSlug(row.slug);
  const nameClass = portionClassForName(toSearchText(row.name));
  if (nameClass === null || nameClass === slugClass) {
    return [];
  }
  return [{ name: row.name, slug: row.slug, slugClass, nameClass }];
});

for (const conflict of conflicts) {
  console.error(
    `${conflict.name} (${conflict.slug}): name says ${conflict.nameClass}, curated table says ${conflict.slugClass ?? "no class"}`,
  );
}

console.log(`${rows.length} rows checked, ${conflicts.length} conflicts`);
process.exit(conflicts.length === 0 ? 0 : 1);
