"""Deterministic sanity rules over a parsed nutrition table (spec §4.4).

Rule-based only - no AI involvement, per the hard requirement in spec §1.
These rules are what upgrade the confirm step from "user eyeballs it" to
"machine catches the 10x errors, user simply confirms".
"""

from dataclasses import dataclass

MAX_COMPONENT_TOTAL_G = 100.0
ATWATER_TOLERANCE = 0.30
KJ_PER_KCAL = 4.184
KJ_TOLERANCE = 0.05

KCAL_PER_G_CARBOHYDRATE = 4.0
KCAL_PER_G_FAT = 9.0
KCAL_PER_G_PROTEIN = 4.0


@dataclass(frozen=True)
class NutritionValues:
    """One product's mandatory EU nutrition figures, all per 100g."""

    energy_kcal: float
    fat_g: float
    saturates_g: float
    carbohydrate_g: float
    sugars_g: float
    protein_g: float
    salt_g: float


def _component_total_flags(values: NutritionValues) -> tuple[str, ...]:
    total = values.fat_g + values.carbohydrate_g + values.protein_g + values.salt_g
    if total <= MAX_COMPONENT_TOTAL_G:
        return ()
    return ("fat_g", "carbohydrate_g", "protein_g", "salt_g")


def _subset_flags(values: NutritionValues) -> tuple[str, ...]:
    flags: list[str] = []
    if values.saturates_g > values.fat_g:
        flags += ["saturates_g", "fat_g"]
    if values.sugars_g > values.carbohydrate_g:
        flags += ["sugars_g", "carbohydrate_g"]
    return tuple(flags)


def _atwater_flags(values: NutritionValues) -> tuple[str, ...]:
    """Energy must roughly match its macronutrients.

    The wide tolerance accommodates fibre, polyols and alcohol, which carry
    energy but are not among the mandatory seven fields.
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


def _energy_unit_flags(values: NutritionValues, energy_kj: float | None) -> tuple[str, ...]:
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
        name for name, value in vars(values).items() if value is None or value < 0
    )


def validate(values: NutritionValues, energy_kj: float | None = None) -> tuple[str, ...]:
    """Return the names of fields that failed a rule. Empty means all passed."""
    flags = (
        _negative_flags(values)
        + _component_total_flags(values)
        + _subset_flags(values)
        + _atwater_flags(values)
        + _energy_unit_flags(values, energy_kj)
    )
    return tuple(sorted(set(flags)))
