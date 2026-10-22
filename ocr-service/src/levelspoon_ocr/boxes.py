"""Geometry-level primitives shared by the name and nutrition parsers.

Coordinates are box centres. Absolute pixel positions are never compared
against fixed thresholds anywhere in this package - see cluster_columns.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Box:
    """One text detection: what was read, where, and how sure the model was."""

    text: str
    x: float
    y: float
    confidence: float


@dataclass(frozen=True)
class OcrResult:
    """Everything one photograph produced, plus the dimensions parsers need.

    image_width matters because column detection is expressed as a fraction
    of it rather than an absolute pixel offset (spec §4.2).
    """

    boxes: tuple[Box, ...]
    image_width: int
    image_height: int


# A gap wider than this fraction of the image starts a new column. Tuned to
# separate a nutrition table's label and value columns while keeping
# multilingual label fragments ("Energija" / "Energy") together.
COLUMN_GAP_RATIO = 0.05


def cluster_columns(
    boxes: tuple[Box, ...], image_width: int
) -> tuple[tuple[Box, ...], ...]:
    """Group boxes into columns by horizontal gaps, left to right.

    Relative, not an absolute pixel threshold such as `x > 800`, which
    breaks on any photo of a different resolution, crop, or zoom (spec §4.2).
    """
    if not boxes:
        return ()

    min_gap = image_width * COLUMN_GAP_RATIO
    by_x = sorted(boxes, key=lambda box: box.x)

    columns: list[list[Box]] = [[by_x[0]]]
    for box in by_x[1:]:
        if box.x - columns[-1][-1].x > min_gap:
            columns.append([box])
        else:
            columns[-1].append(box)

    return tuple(tuple(sorted(column, key=lambda box: box.y)) for column in columns)
