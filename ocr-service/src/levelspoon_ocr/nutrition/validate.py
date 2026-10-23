"""Deterministic sanity rules over a parsed nutrition table (spec §4.4).

Rule-based only - no AI involvement, per the hard requirement in spec §1.
These rules are what upgrade the confirm step from "user eyeballs it" to
"machine catches the 10x errors, user simply confirms".
"""

from dataclasses import dataclass

MAX_COMPONENT_TOTAL_G = 100.0

# US labels round each macro on the serving to the nearest 0.5-1 g (FDA
# 21 CFR 101.9(c)), and scaling a small serving up to 100 g multiplies that
# drift by 100/serving_g - roughly 2-3.3x for the usual 30-50 g servings, so
# up to ~5 g of legitimate overshoot. The rule exists to catch 10x misreads,
# which land hundreds of grams out, so this tolerance costs it nothing.
COMPONENT_TOTAL_TOLERANCE_G = 5.0
ATWATER_TOLERANCE = 0.30
KJ_PER_KCAL = 4.184
KJ_TOLERANCE = 0.05

KCAL_PER_G_CARBOHYDRATE = 4.0
KCAL_PER_G_FAT = 9.0
KCAL_PER_G_PROTEIN = 4.0


# The one figure a label may legally omit: EU Reg 1169/2011 makes fibre
# optional, FDA 21 CFR 101.9 makes it mandatory. Every other None is a value
# the parser failed to read, which is why only this one is exempt below.
OPTIONAL_FIELDS = frozenset({"fibre_g"})


@dataclass(frozen=True)
class NutritionValues:
    """One product's EU nutrition figures, all per 100g.

    `fibre_g` is None when the label printed no fibre row - never 0, which
    would be a figure nobody wrote down.
    """

    energy_kcal: float
    fat_g: float
    saturates_g: float
    carbohydrate_g: float
    sugars_g: float
    protein_g: float
    salt_g: float
    fibre_g: float | None = None


COMPONENT_TOTAL_FIELDS = ("fat_g", "carbohydrate_g", "protein_g", "salt_g")


def _component_total_flags(values: NutritionValues) -> tuple[str, ...]:
    fibre_g = 0.0 if values.fibre_g is None else values.fibre_g
    total = (
        values.fat_g
        + values.carbohydrate_g
        + values.protein_g
        + values.salt_g
        + fibre_g
    )
    if total <= MAX_COMPONENT_TOTAL_G + COMPONENT_TOTAL_TOLERANCE_G:
        return ()
    if values.fibre_g is None:
        return COMPONENT_TOTAL_FIELDS
    return COMPONENT_TOTAL_FIELDS + ("fibre_g",)


# No fibre <= carbohydrate rule, deliberately: the EU carbohydrate figure
# excludes fibre (Reg 1169/2011 Annex I), so wheat bran's 43g fibre against
# 22g carbohydrate is a correctly printed label, not a misread. The US
# convention that would justify the rule is normalised away in us_label.py.
def _subset_flags(values: NutritionValues) -> tuple[str, ...]:
    flags: list[str] = []
    if values.saturates_g > values.fat_g:
        flags += ["saturates_g", "fat_g"]
    if values.sugars_g > values.carbohydrate_g:
        flags += ["sugars_g", "carbohydrate_g"]
    return tuple(flags)


def _atwater_flags(values: NutritionValues) -> tuple[str, ...]:
    """Energy must roughly match its macronutrients.

    The wide tolerance accommodates polyols and alcohol, and fibre on the
    labels that print none - fibre carries energy whether or not it was
    declared, so reading it does not narrow the band on its own.
    """
    predicted = (
        KCAL_PER_G_CARBOHYDRATE * values.carbohydrate_g
        + KCAL_PER_G_FAT * values.fat_g
        + KCAL_PER_G_PROTEIN * values.protein_g
    )
    if predicted == 0:
        return ()
    if abs(values.energy_kcal - predicted) <= predicted * ATWATER_TOLERANCE:
        return ()
    return ("energy_kcal",)


def _energy_unit_flags(
    values: NutritionValues, energy_kj: float | None
) -> tuple[str, ...]:
    if energy_kj is None:
        return ()
    expected_kj = values.energy_kcal * KJ_PER_KCAL
    if expected_kj == 0:
        return ()
    if abs(energy_kj - expected_kj) <= expected_kj * KJ_TOLERANCE:
        return ()
    return ("energy_kcal",)


def _negative_flags(values: NutritionValues) -> tuple[str, ...]:
    return tuple(
        name
        for name, value in vars(values).items()
        if (value is None and name not in OPTIONAL_FIELDS)
        or (value is not None and value < 0)
    )


def validate(
    values: NutritionValues, energy_kj: float | None = None
) -> tuple[str, ...]:
    """Return the names of fields that failed a rule. Empty means all passed."""
    flags = (
        _negative_flags(values)
        + _component_total_flags(values)
        + _subset_flags(values)
        + _atwater_flags(values)
        + _energy_unit_flags(values, energy_kj)
    )
    return tuple(sorted(set(flags)))
