"""Read a product name off a package front (spec §4.2).

Noise is filtered on confidence, length and content, never on a list of
strings seen in one photo, and nothing is reordered - trigram matching is
order-tolerant by construction, so word order need only be stable, not
correct.

A second kind of noise showed up on a real Snickers wrapper: "250 CALORIES
PER PACK ... NET WT 1.86 OZ (52.7g) ... BAR" joined in as one blob. Net
weight and calorie declarations are NIST/FDA-mandated boilerplate, printed
in a fixed format on every US package regardless of brand - unlike a
blocklist of specific junk strings, matching that format generalises to any
product rather than hardcoding one photo's noise.
"""

import math
import re

from .boxes import Box, OcrResult

# Observed on fixtures/ocr-boxes/olympus-greek-2pct-front.json:
# real tokens >= 0.978 (Greek, OLYMPUS, STRAINED, RECIPE YOGURT, FAT, 2,
# RICH IN PROTEIN, LOW FAT); the only other detection is one empty-string
# box at confidence 0.0, so 0.85 separates real content from the junk
# detection with large margin on both sides.
MIN_NAME_CONFIDENCE = 0.85
MIN_TOKEN_LENGTH = 2

NET_WEIGHT_MARKER = re.compile(r"net\s*wt\.?", re.IGNORECASE)
CALORIE_DECLARATION_MARKER = re.compile(
    r"calories?\b|per\s+(pack|serving|container)\b", re.IGNORECASE
)
BARE_NUMBER = re.compile(r"^\d+(?:[.,]\d+)?$")


def _is_declared_quantity(box: Box) -> bool:
    """A net-weight or calorie declaration line, entirely in the box's own
    text - these never carry brand content on real packaging."""
    text = box.text.strip()
    return bool(
        NET_WEIGHT_MARKER.search(text) or CALORIE_DECLARATION_MARKER.search(text)
    )


def _is_meaningful(box: Box) -> bool:
    """Keep real words and variant markers; drop artwork artefacts.

    Note the alphanumeric test rather than an alphabetic one: "2%" carries the
    fat-percentage distinction that spec §1's margin rule relies on to tell
    "Greek Yogurt 2%" from "Greek Yogurt 10%", so it must survive.
    """
    text = box.text.strip()
    return (
        box.confidence >= MIN_NAME_CONFIDENCE
        and len(text) >= MIN_TOKEN_LENGTH
        and any(character.isalnum() for character in text)
        and not _is_declared_quantity(box)
    )


# Unweighted, unlike the nutrition parser's row-association distance: a
# calorie badge is a narrow stacked column (the Snickers capture measures
# ~1px of horizontal spread against ~35px of vertical spread), not a wide
# short row, so no directional bias is assumed here without evidence.
def _distance(left: Box, right: Box) -> float:
    return math.hypot(left.x - right.x, left.y - right.y)


def _calorie_figure(boxes: tuple[Box, ...]) -> Box | None:
    """The bare-number box that is the calorie declaration's own figure -
    e.g. "250" next to a "CALORIES" badge - identified by proximity, since
    the figure carries no marker text of its own to match on directly.

    Requires the calorie marker to be that number's single nearest box out
    of every other box on the page, not merely nearest among some
    candidate shortlist: a page with no true calorie figure must never
    claim an unrelated bare number just because it happens to be closest
    among whatever else was checked.
    """
    markers = tuple(box for box in boxes if CALORIE_DECLARATION_MARKER.search(box.text))
    if not markers:
        return None
    marker_ids = {id(box) for box in markers}
    numbers = tuple(box for box in boxes if BARE_NUMBER.fullmatch(box.text.strip()))
    for number in numbers:
        others = tuple(box for box in boxes if box is not number)
        nearest = min(others, key=lambda other: _distance(number, other))
        if id(nearest) in marker_ids:
            return number
    return None


def extract_product_name(result: OcrResult) -> str:
    """Join the surviving detections top-to-bottom into a matchable name."""
    calorie_figure = _calorie_figure(result.boxes)
    kept = sorted(
        (
            box
            for box in result.boxes
            if _is_meaningful(box) and box is not calorie_figure
        ),
        key=lambda box: box.y,
    )
    return " ".join(box.text.strip() for box in kept)


def extract_net_weight_text(result: OcrResult) -> str | None:
    """The label's own net-weight declaration, verbatim - e.g. "NET WT 1.86
    OZ (52.7g)" - or None when the package prints no such line.

    Returned as text, not a parsed gram figure: converting the printed unit
    is the app's job, the same "report what's printed" split this service
    already applies to a nutrition label's serving-size line.
    """
    marker = next(
        (box for box in result.boxes if NET_WEIGHT_MARKER.search(box.text)), None
    )
    return marker.text.strip() if marker else None
