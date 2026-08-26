"""Read a product name off a package front (spec §4.2).

The spike filtered noise with a hardcoded set of strings observed on the
Olympus mountain logo, and reordered one stacked "2% / FAT" badge by name.
Both are replaced here: noise is filtered on confidence, length and content,
and no reordering happens at all - trigram matching is order-tolerant by
construction, so word order need only be stable, not correct.
"""

from .boxes import Box, OcrResult

# Below this, PaddleOCR is typically reading artwork rather than text.
MIN_NAME_CONFIDENCE = 0.85
MIN_TOKEN_LENGTH = 2


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
    )


def extract_product_name(result: OcrResult) -> str:
    """Join the surviving detections top-to-bottom into a matchable name."""
    kept = sorted(
        (box for box in result.boxes if _is_meaningful(box)),
        key=lambda box: box.y,
    )
    return " ".join(box.text.strip() for box in kept)
