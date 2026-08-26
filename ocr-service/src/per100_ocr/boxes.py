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
