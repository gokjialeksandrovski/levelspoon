"""Parse US FDA "Nutrition Facts" labels into per-serving values.

Where the EU parser clusters boxes into columns, this one associates each
printed marker with its own figure geometrically. Clustering boxes into rows
by y-coordinate alone does not survive the FDA's linear (side-by-side)
format, where the two columns share y-coordinates and consecutive rows sit
~10px apart: joining a row into a string and regexing it discards exactly the
geometry needed to tell which value belongs to which label.

This module reports what is printed. Scaling a serving to a per-100g baseline
belongs to the caller, which is the only side that knows what a "bar" weighs.
"""

import math
import re
from dataclasses import dataclass

from ..boxes import Box, OcrResult
from .normalize import NormalizationError, to_grams
from .validate import NutritionValues

# Salt = sodium x 2.5, the standard regulatory conversion (EU Reg 1169/2011
# Annex I; FDA uses the same factor) derived from NaCl's molar-mass ratio to
# sodium alone - a fixed constant, not a guess.
SODIUM_TO_SALT_FACTOR = 2.5

# Matched against the concatenation of every box's text, not per box: OCR
# splits "Nutrition Facts" into two boxes on a real linear label, and the
# printed "% Daily Value*" header can fail to be emitted as a box at all.
# "Amount/serving" is the linear format's wording; "servings per container"
# appears on every US label and on no EU one.
US_LABEL_MARKERS = (
    re.compile(r"nutrition\s+facts", re.IGNORECASE),
    re.compile(r"amount\s*(?:per|/)\s*serving", re.IGNORECASE),
    re.compile(r"%\s*daily\s+value", re.IGNORECASE),
    re.compile(r"servings?\s+per\s+container", re.IGNORECASE),
)

# Keyed by NutritionValues field name, except "sodium_g", converted to salt
# below. "Total Sugars" never picks up the "Includes Xg Added Sugars" line:
# the two phrases differ.
ROW_MARKERS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("energy_kcal", re.compile(r"calories\b", re.IGNORECASE)),
    ("fat_g", re.compile(r"total fat\b", re.IGNORECASE)),
    ("saturates_g", re.compile(r"saturated fat\b", re.IGNORECASE)),
    ("sodium_g", re.compile(r"sodium\b", re.IGNORECASE)),
    ("carbohydrate_g", re.compile(r"total carbohydrate\b", re.IGNORECASE)),
    ("sugars_g", re.compile(r"total sugars\b", re.IGNORECASE)),
    ("protein_g", re.compile(r"protein\b", re.IGNORECASE)),
)

SERVING_SIZE_MARKER = re.compile(r"serving size", re.IGNORECASE)

# The serving-size line is associated by the same two passes as the nutrient
# markers, so it needs a field name to be keyed by.
SERVING_SIZE_FIELD = "serving_size"

# A count of containers, never a nutrition value. Excluded from the figure
# pool outright: on a linear label it sits nearer to "Serving size" than the
# real measure does, and would otherwise be claimed as the serving size.
SERVINGS_PER_CONTAINER = re.compile(r"servings?\s+per\s+container", re.IGNORECASE)

# "%" is captured only so a %DV can be told apart from a gram figure and
# skipped - a %DV is never a value.
FIGURE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(mg|g|%)?", re.IGNORECASE)

# `\b` after the unit is what keeps "4 gummies" and "2 graham crackers" from
# reading as gram weights: "g" followed by another letter is not a word
# boundary. Parentheses are not required, because OCR routinely drops or
# mangles them on the FDA's "2 Tbsp (37g)" form.
SERVING_SIZE_GRAMS = re.compile(r"(\d+(?:[.,]\d+)?)\s*g\b", re.IGNORECASE)

# Vertical separation is penalised harder than horizontal, so a figure on the
# same printed line beats one directly above or below. Label rows are far
# wider than they are tall: the linear Snickers fixture measures ~10px between
# printed rows against ~130px between the two columns, so an unweighted
# distance would prefer the wrong column's figure over the right row's.
VERTICAL_WEIGHT = 4.0


@dataclass(frozen=True)
class UsLabelReading:
    """One US label as printed: per-serving values plus its serving line.

    `serving_grams` is None when the label prints a household or count measure
    with no bracketed weight - an ordinary, expected condition, not a failure.
    """

    per_serving: NutritionValues
    serving_size_text: str
    serving_grams: float | None


def _reading_order(boxes: tuple[Box, ...]) -> tuple[Box, ...]:
    return tuple(sorted(boxes, key=lambda box: (box.y, box.x)))


def is_us_label(result: OcrResult) -> bool:
    """True when the photo carries a US-only marker no EU label prints."""
    joined = " ".join(box.text for box in _reading_order(result.boxes))
    return any(marker.search(joined) for marker in US_LABEL_MARKERS)


def _figure_after(text: str, start: int) -> float | None:
    """The first non-percentage figure at or after `start` in one box's text."""
    for match in FIGURE.finditer(text, start):
        unit = (match.group(2) or "").lower()
        if unit == "%":
            continue
        number = match.group(1)
        return to_grams(f"{number}{unit}") if unit else float(number.replace(",", "."))
    return None


def _is_figure_box(box: Box) -> bool:
    if SERVINGS_PER_CONTAINER.search(box.text):
        return False
    return _figure_after(box.text, 0) is not None


def _distance(left: Box, right: Box) -> float:
    return math.hypot(left.x - right.x, VERTICAL_WEIGHT * (left.y - right.y))


def _nearest(target: Box, candidates: tuple[Box, ...]) -> Box | None:
    return min(candidates, key=lambda box: _distance(target, box), default=None)


def _topmost(boxes: tuple[Box, ...], marker: re.Pattern[str]) -> Box | None:
    """The topmost box carrying `marker`.

    Topmost is what keeps a "2,000 calories a day" footnote from standing in
    for the Calories row printed above it.
    """
    return next((box for box in boxes if marker.search(box.text)), None)


def _marker_boxes(boxes: tuple[Box, ...]) -> dict[str, Box]:
    """One box per marker, nutrients and the serving-size line alike."""
    found: dict[str, Box] = {}
    for field, marker in ROW_MARKERS + ((SERVING_SIZE_FIELD, SERVING_SIZE_MARKER),):
        box = _topmost(boxes, marker)
        if box is None:
            raise NormalizationError(f"No box found for marker: {marker.pattern!r}")
        found[field] = box
    return found


def _self_contained_values(marker_boxes: dict[str, Box]) -> dict[str, float]:
    """Pass 1: every marker whose own box also carries its figure.

    On a real linear label this resolves six of the seven fields with no
    geometric reasoning at all, which is why it is always tried first.
    """
    values: dict[str, float] = {}
    for field, marker in ROW_MARKERS:
        box = marker_boxes[field]
        match = marker.search(box.text)
        figure = None if match is None else _figure_after(box.text, match.end())
        if figure is not None:
            values[field] = figure
    return values


def _self_contained_serving(box: Box) -> str | None:
    """The measure printed on the serving-size marker's own box, if any.

    "Serving Size 2 Tbsp (30g)" carries its measure; a linear label's bare
    "Serving size" does not, and hands the job to pass 2.
    """
    match = SERVING_SIZE_MARKER.search(box.text)
    remainder = box.text[match.end():].strip() if match else ""
    return remainder or None


def _figure_pool(boxes: tuple[Box, ...], marker_boxes: dict[str, Box]) -> tuple[Box, ...]:
    """Every box that could stand in for a value, markers themselves excluded."""
    claimed = {id(box) for box in marker_boxes.values()}
    return tuple(box for box in boxes if _is_figure_box(box) and id(box) not in claimed)


def _mutual_pairs(
    unresolved: dict[str, Box], figures: tuple[Box, ...], all_markers: tuple[Box, ...]
) -> dict[str, Box]:
    """Pass 2: pair a marker with a figure only when each is the other's nearest.

    Both directions must agree, and the marker direction is judged against
    every marker, not only the unresolved ones. That is what rejects a vitamin
    figure sitting on the Calories line: its own nearest marker is Protein.
    Mutual agreement also makes the pairing order-independent, since no two
    markers can both be a single box's nearest marker.
    """
    pairs: dict[str, Box] = {}
    for field, marker_box in unresolved.items():
        candidate = _nearest(marker_box, figures)
        if candidate is not None and _nearest(candidate, all_markers) is marker_box:
            pairs[field] = candidate
    return pairs


def _associate(
    boxes: tuple[Box, ...], marker_boxes: dict[str, Box], resolved: set[str]
) -> dict[str, Box]:
    unresolved = {field: box for field, box in marker_boxes.items() if field not in resolved}
    return _mutual_pairs(unresolved, _figure_pool(boxes, marker_boxes), tuple(marker_boxes.values()))


def _value_of(box: Box) -> float:
    figure = _figure_after(box.text, 0)
    if figure is None:
        raise NormalizationError(f"No figure in the box claimed as a value: {box.text!r}")
    return figure


def _serving_grams(serving_size_text: str) -> float | None:
    """A gram weight printed alongside the household measure, if any."""
    match = SERVING_SIZE_GRAMS.search(serving_size_text)
    if match is None:
        return None
    grams = float(match.group(1).replace(",", "."))
    if grams <= 0:
        raise NormalizationError(f"Non-positive gram weight on label: {grams!r}")
    return grams


def _build_reading(readings: dict[str, float], serving_size_text: str | None) -> UsLabelReading:
    for field, marker in ROW_MARKERS:
        if field not in readings:
            raise NormalizationError(f"No value found for marker: {marker.pattern!r}")
    if serving_size_text is None:
        raise NormalizationError("No serving measure found on US label")

    sodium_g = readings.pop("sodium_g")
    return UsLabelReading(
        per_serving=NutritionValues(salt_g=sodium_g * SODIUM_TO_SALT_FACTOR, **readings),
        serving_size_text=serving_size_text,
        serving_grams=_serving_grams(serving_size_text),
    )


def _detached_weight(marker_boxes: dict[str, Box], boxes: tuple[Box, ...], claimed: set[int]) -> Box | None:
    """The box mutually nearest to the serving-size marker among what pass 2
    left unclaimed - the exact reciprocal check pass 2 already applies to
    every field, run once more now that the marker's first match is spoken
    for. Mutuality (not mere proximity) is what a genuinely bracket-less
    label needs: an unrelated nutrient figure can easily be the nearest
    leftover box on the page, but it is never mutually nearest back to the
    serving-size marker specifically once its own row's marker is closer.
    """
    remaining = tuple(box for box in _figure_pool(boxes, marker_boxes) if id(box) not in claimed)
    target = {SERVING_SIZE_FIELD: marker_boxes[SERVING_SIZE_FIELD]}
    return _mutual_pairs(target, remaining, tuple(marker_boxes.values())).get(SERVING_SIZE_FIELD)


def _with_detached_weight(
    text: str, marker_boxes: dict[str, Box], boxes: tuple[Box, ...], claimed: set[int]
) -> str:
    """Reunite a household measure with a bracketed weight OCR split off it.

    "1 bar (47g)" can land as two boxes - "1 bar" and "(47g)" - on a real
    photographed label, and pass 2 pairs the serving-size marker with only
    one box before it stops. The second box must independently be both
    mutually nearest to the marker and itself a bare gram weight.
    """
    if SERVING_SIZE_GRAMS.search(text):
        return text
    detached = _detached_weight(marker_boxes, boxes, claimed)
    if detached is None or not SERVING_SIZE_GRAMS.search(detached.text):
        return text
    return f"{text} {detached.text.strip()}"


def read_us_label(result: OcrResult) -> UsLabelReading:
    """Read one US label into per-serving values plus its serving line."""
    boxes = _reading_order(result.boxes)
    marker_boxes = _marker_boxes(boxes)

    readings = _self_contained_values(marker_boxes)
    serving_size_text = _self_contained_serving(marker_boxes[SERVING_SIZE_FIELD])
    resolved = set(readings) | ({SERVING_SIZE_FIELD} if serving_size_text else set())

    paired = _associate(boxes, marker_boxes, resolved)
    for field, box in paired.items():
        if field == SERVING_SIZE_FIELD:
            serving_size_text = box.text.strip()
        else:
            readings[field] = _value_of(box)

    if serving_size_text is not None:
        claimed = {id(box) for box in paired.values()}
        serving_size_text = _with_detached_weight(serving_size_text, marker_boxes, boxes, claimed)

    return _build_reading(readings, serving_size_text)
