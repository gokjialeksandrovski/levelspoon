"""The shared result shape both the EU and US parsing branches return."""

from dataclasses import dataclass

from .validate import NutritionValues


@dataclass(frozen=True)
class NutritionReading:
    """Parsed values plus the fields the rules could not vouch for."""

    values: NutritionValues
    flags: tuple[str, ...]
    energy_kj: float | None
