"""The shared result shape both the EU and US parsing branches return."""

from dataclasses import dataclass
from enum import StrEnum

from .validate import NutritionValues


class LabelFormat(StrEnum):
    """Which regulatory layout the photo turned out to be."""

    EU = "eu"
    US = "us"


@dataclass(frozen=True)
class NutritionReading:
    """One label as read. Exactly one of per_100g / per_serving is non-None.

    A US label reports per-serving figures and its serving line as printed;
    converting that serving to grams needs knowledge this service does not
    have (what a "bar" weighs), so the caller does the scaling and the
    validation that follows it.
    """

    label_format: LabelFormat
    per_100g: NutritionValues | None
    per_serving: NutritionValues | None
    flags: tuple[str, ...]
    energy_kj: float | None
    serving_size_text: str | None
    serving_grams: float | None
    servings_per_container: float | None
