# fixtures/standard-foods.json

Curated whole-food + cooking-staple nutrition, per 100 g. Seeded into `products`
as `source = 'standard'` rows by `app/scripts/seed.ts` (`seedStandardFoods`).

Source: USDA FoodData Central — https://fdc.nal.usda.gov/ — SR Legacy +
Foundation Foods. Public domain: no attribution or licence constraint.
Extracted 2026-09-11.

`saltG` = sodium (mg) x 2.5 / 1000 — EU salt-equivalent convention. USDA
reports sodium, not salt.

`fibreG` = USDA "Fiber, total dietary" (nutrient 1079). Required and ≥ 0 on
every row; fat rows are `0`.

Row schema enforced by `assertValidStandardFood` — a bad row fails
`pnpm run db:seed` loudly with `StandardFoodRowError`.

246 rows: 214 whole, 32 fat. 10 rows spot-checked against USDA FDC on 2026-09-11; the
2026-09-16 fat additions cross-checked against USDA FDC / myfooddata where
available (mustard oil, beef tallow, vegetable shortening, MCT oil), rest
from well-established per-oil saturated-fat figures consistent across
USDA-derived databases.
