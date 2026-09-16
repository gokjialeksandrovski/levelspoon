# fixtures/standard-foods.json

Curated whole-food + cooking-staple nutrition, per 100 g. Seeded into `products`
as `source = 'standard'` rows by `app/scripts/seed.ts` (`seedStandardFoods`).

Source: USDA FoodData Central — https://fdc.nal.usda.gov/ — SR Legacy +
Foundation Foods. Public domain: no attribution or licence constraint.
Extracted 2026-09-11.

`saltG` = sodium (mg) x 2.5 / 1000 — EU salt-equivalent convention. USDA
reports sodium, not salt.

Row schema enforced by `assertValidStandardFood` — a bad row fails
`npm run db:seed` loudly with `StandardFoodRowError` (the design spec that
originally defined it is deleted post-ship; recover from git history if needed).

212 rows (T1 starter + T1b + 21-row cooking-oil/fat expansion, 2026-09-16).
180 whole, 32 fat. 10 rows spot-checked against USDA FDC on 2026-09-11; the
2026-09-16 fat additions cross-checked against USDA FDC / myfooddata where
available (mustard oil, beef tallow, vegetable shortening, MCT oil), rest
from well-established per-oil saturated-fat figures consistent across
USDA-derived databases.
