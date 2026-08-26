"""Locate the per-100g value column on a nutrition label.

The spike took `value_column[1:]`, assuming exactly one header box sat above
the values. A label with a "per serving" second column, or with no header
detected at all, shifts every field by one - silently, with no error
(spec §4.2). Anchoring on the header text removes the assumption.
"""

import re

from ..boxes import Box, OcrResult, cluster_columns

PER_100G_HEADER = re.compile(r"/?\s*100\s*g", re.IGNORECASE)


class ColumnDetectionError(Exception):
    """The per-100g value column could not be identified."""


def _header_box(result: OcrResult) -> Box:
    headers = [box for box in result.boxes if PER_100G_HEADER.search(box.text)]
    if not headers:
        raise ColumnDetectionError(
            "No per-100g header (e.g. '100 g', '/100') found among "
            f"{len(result.boxes)} detected boxes"
        )
    return min(headers, key=lambda box: box.y)


def find_per_100g_values(result: OcrResult) -> tuple[Box, ...]:
    """Value boxes belonging to the per-100g column, ordered top to bottom."""
    header = _header_box(result)
    columns = cluster_columns(result.boxes, result.image_width)

    for column in columns:
        if header in column:
            return tuple(box for box in column if box.y > header.y)

    raise ColumnDetectionError("Header box was not assigned to any column")
