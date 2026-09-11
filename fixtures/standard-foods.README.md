# fixtures/standard-foods.json

Curated whole-food + cooking-staple nutrition, per 100 g. Seeded into `products`
as `source = 'standard'` rows by `app/scripts/seed.ts` (`seedStandardFoods`).

Source: USDA FoodData Central — https://fdc.nal.usda.gov/ — SR Legacy +
Foundation Foods. Public domain: no attribution or licence constraint.
Extracted 2026-09-11.

`saltG` = sodium (mg) x 2.5 / 1000 — EU salt-equivalent convention. USDA
reports sodium, not salt.

Row schema: spec §5, `docs/superpowers/specs/2026-09-11-standard-foods-design.md`.
Validated at seed time by `assertValidStandardFood` — a bad row fails
`npm run db:seed` loudly with `StandardFoodRowError`.

Starter set: 11 rows (T1). T1b expands to ~200 and re-checks every value against
USDA FDC.
