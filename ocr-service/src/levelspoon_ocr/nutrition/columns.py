"""Locate the per-100g value column on a nutrition label.

Not a positional `value_column[1:]` slice: a label with a "per serving"
second column, or with no header detected at all, would shift every field by
one - silently, with no error (spec §4.2). Nor the header text alone: a real
multilingual label can print its header phrase aligned with the row
descriptions rather than the numeric column (no header box of its own sits
above the values), so the energy figure anchors the column instead.
"""

import re

from ..boxes import Box, OcrResult, cluster_columns
from .normalize import ENERGY_FIGURE

# "ml" first: a drink's label states its figures per 100 ml. No word boundary
# after "g", so "100 gr" still counts; "100 mg" matches neither.
PER_100_HEADER = re.compile(r"100\s*(ml|g)", re.IGNORECASE)

# "263 kCal/100g" states one figure's basis inside running text, not a column
# heading. Counted as a header, it sends a prose declaration (no table at all)
# down the table path, which maps its figures by position.
ENERGY_PER_100 = re.compile(r"(?:kj|kcal)\s*/\s*100\s*(?:ml|g)", re.IGNORECASE)

# Kept in sync with parse.py's EU_ROW_ORDER (fat/saturates/
# carbohydrate/sugars/protein/salt - EU Reg 1169/2011's fixed six-row
# block, before an optional fibre row extends it to seven). Duplicated
# rather than imported: parse.py already imports this module, so the
# reverse import would be circular.
CORE_NUTRIENT_ROWS = 6

# A row-to-row gap this many times the label's own median row spacing
# signals a value missing from the middle, not natural spacing variance -
# tuned against a real label where the true anomaly (a missing saturates
# value) measured ~2.05x the label's own median row gap, comfortably clear
# of every legitimate gap examined on the same label (at most ~1.0x within
# the six-row block).
GAP_ANOMALY_FACTOR = 1.6

# A median needs at least two samples to mean anything.
MIN_GAPS_FOR_A_MEDIAN = 2


class ColumnDetectionError(Exception):
    """The per-100g value column could not be identified."""


def _header(result: OcrResult) -> tuple[Box, str]:
    """The topmost per-100 header box, and the unit ("g" or "ml") it names."""
    headers = [
        (box, match.group(1).lower())
        for box in result.boxes
        if (match := PER_100_HEADER.search(ENERGY_PER_100.sub(" ", box.text)))
    ]
    if not headers:
        raise ColumnDetectionError(
            "No per-100 header (e.g. '100 g', '100 ml') found among "
            f"{len(result.boxes)} detected boxes"
        )
    return min(headers, key=lambda header: header[0].y)


def per_100_basis_unit(result: OcrResult) -> str:
    """The unit, "g" or "ml", that the label states its figures per 100 of."""
    return _header(result)[1]


def _energy_box(boxes: tuple[Box, ...], header: Box) -> Box | None:
    """The topmost box carrying a kJ or kcal figure, from the header down.

    Energy is mandatory on every EU label (Reg 1169/2011) and always a
    value, never label text - anchoring the value column on it is more
    robust than anchoring on the "100 g" header, which some labels print
    aligned with the row descriptions instead of the value column (observed
    on a real multilingual label: the four-language header phrase joins the
    description column, while the figures sit in a separate column with no
    header of their own).

    Nothing above the header counts: a front-of-pack "263 kcal" badge would
    otherwise anchor the column on the wrong side of the photo.
    """
    matches = [
        box for box in boxes if box.y >= header.y and ENERGY_FIGURE.search(box.text)
    ]
    return min(matches, key=lambda box: box.y) if matches else None


def _looks_like_a_value(box: Box) -> bool:
    """Loose on purpose: a genuinely mis-clustered value can OCR as badly
    as a real capture's " e  s ,8" - too garbled to match a real number
    pattern, but still digit-bearing, unlike a label description."""
    return any(character.isdigit() for character in box.text)


def _reclaim_missing_rows(
    values: tuple[Box, ...], other_boxes: tuple[Box, ...]
) -> tuple[Box, ...]:
    """Reunite a value OCR mis-clustered out of the value column.

    A digit-bearing box below the header, sitting in the gap between two
    consecutive resolved values, is very likely that gap's missing row -
    label text this close to a real value essentially never carries digits.
    Filling the gap (not just noting it) is what stops every field after it
    from silently shifting into the wrong slot; the existing decimal and
    plausibility rules (decimals.py, validate.py) still catch a garbled
    recovered figure like any other suspicious value.
    """
    reclaimed = list(values)
    index = 1  # position 0 is energy, never itself a missing row
    while index < len(reclaimed) - 1 and index < CORE_NUTRIENT_ROWS:
        gaps = [b.y - a.y for a, b in zip(reclaimed[1:], reclaimed[2:])]
        if len(gaps) < MIN_GAPS_FOR_A_MEDIAN:
            index += 1
            continue
        upper, lower = reclaimed[index], reclaimed[index + 1]
        median_gap = sorted(gaps)[len(gaps) // 2]
        if lower.y - upper.y > GAP_ANOMALY_FACTOR * median_gap:
            candidates = [
                box
                for box in other_boxes
                if upper.y < box.y < lower.y and _looks_like_a_value(box)
            ]
            if candidates:
                midpoint = (upper.y + lower.y) / 2
                reclaimed.insert(
                    index + 1, min(candidates, key=lambda box: abs(box.y - midpoint))
                )
        index += 1
    return tuple(reclaimed)


def find_per_100g_values(result: OcrResult) -> tuple[Box, ...]:
    """Value boxes belonging to the per-100g column, ordered top to bottom."""
    header, _ = _header(result)
    energy = _energy_box(result.boxes, header)
    anchor = energy or header
    # Clustered from the first table row down: a heading line above it
    # ("Average nutritional values in", centred between the description and
    # value columns on a real multilingual carton) otherwise bridges the gap
    # and merges both into one column.
    table_boxes = tuple(box for box in result.boxes if box.y >= anchor.y)
    columns = cluster_columns(table_boxes, result.image_width)

    for column in columns:
        if anchor in column:
            # The energy box is kept even when it is the header box itself
            # ("100 g 233kJ/56kcal" read as one detection).
            values = tuple(box for box in column if box.y > header.y or box is energy)
            other_boxes = tuple(
                box for box in result.boxes if box not in values and box.y > header.y
            )
            return _reclaim_missing_rows(values, other_boxes)

    raise ColumnDetectionError("Value column was not assigned to any column")
