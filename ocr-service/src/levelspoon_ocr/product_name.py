"""Read a product name off a package front (spec §4.2): brand, what the
product is, and its fat percentage - "Bella Farm Yoghurt 2,8% m.m".

Deterministic (CLAUDE.md "AI usage boundary"). Every rule keys on how
packaging is printed, never on strings seen in one photo:

- Prominence: brand and variant print large, boilerplate small. A word far
  shorter than the tallest one drops, unless it names a product type -
  "TORTILLA CHIPS" often sits in small print under a giant logo.
- Fixed formats: quantities, calorie badges, founding years, nutrition
  claims (EU 1924/2006 wording), promotions. Printed the same on any brand.
- Slogans: a line holding a function word ("Vitalizes body and mind").
- Figures: no number or percentage joins the name except a fat percentage,
  which tells variants apart ("2%" vs "10%") and goes last.
- Script: a Cyrillic reader reads the same photo, and its name wins when
  half its words or more are Cyrillic.

Words keep reading order, top to bottom and left to right along a line:
trigram matching is order-tolerant, and the brand usually prints first.
"""

import math
import re
from dataclasses import dataclass, replace

from .boxes import Box, OcrResult
from .cyrillic import CYRILLIC_LETTER, fold_latin_twins, mixes_scripts

# A stylised wordmark reads lower than plain print: the m&m's logo scored
# 0.847. Junk above 0.8 on the 17 recorded fronts ("Moade with chokses!",
# 0.844) fails a content rule as well.
MIN_NAME_CONFIDENCE = 0.8
# The Cyrillic reader splits probability between twin letters (o/о, p/р), so
# right reads score low: "Бuтолcки" 0.45, "jorypт" 0.66, "Домашна" 0.72.
# Junk on the same photos: "2ена" 0.36.
MIN_CYRILLIC_CONFIDENCE = 0.4
# Measured against the tallest word on the recorded fronts: Milka's
# "Noisette" variant sits at 0.19, boilerplate below 0.16 (Doritos'
# "FLAVORED" 0.14, Lay's "1938" 0.15 and "NO COLORS" 0.13).
PROMINENCE_RATIO = 0.17
# "mm" is the candy-shell print beside the m&m's logo. Ceiling: a
# two-letter brand drops too.
MIN_LETTERS = 3
# Longer lines are ingredient lists or slogans, even when they name a type.
MAX_WORDS = 4
# Shorter all-caps words are acronyms ("UHT", "BBQ") and stay as printed.
MIN_SHOUTED_LETTERS = 4

NET_WEIGHT_MARKER = re.compile(r"net\s*wt\.?", re.IGNORECASE)

QUANTITY = re.compile(
    r"\d\s*(?:k?g|mg|m?l|cl|dl|oz|lbs?|fl|kcal|kj|кг|г|мл|л)\b"
    r"|/\s*(?:k?g|l)\b|net\s*w",
    re.IGNORECASE,
)
# Calorie badges (OCR misreads "CALORIES" as "CALORIESES") and founding years.
DECLARATION = re.compile(r"calori|^per\b|\b(?:since|est|seit)\b", re.IGNORECASE)
CLAIM = re.compile(
    r"\b(?:low|high|rich|source|reduced|added|free|no|new|novo|brand|family"
    r"|share|party|multipack|suggest\w*|serving|gratis|akcija|promo|bonus"
    r"|нов[оа]?|без|гратис|акција|промо|бонус)\b",
    re.IGNORECASE,
)
# English, German, French, South Slavic Latin and Cyrillic, Albanian.
# Ceiling: a flavour named with one ("Cookies and Cream") drops as a slogan.
FUNCTION_WORD = re.compile(
    r"\b(?:and|with|of|the|for|your|to|in|by|und|mit|et|avec|sa|za|dhe|me"
    r"|и|со|са|за|на|од|во)\b",
    re.IGNORECASE,
)
PERCENT = re.compile("%")
NOT_A_NAME = (QUANTITY, DECLARATION, CLAIM, FUNCTION_WORD, PERCENT)

PRODUCT_TYPE = re.compile(
    r"\b(?:chips|crisps|chocolate|[čc]okolad[ae]|schokolade|yog(?:h)?urt|jogurt"
    r"|kos|mayonnaise|majonez[ae]?|noodles?|sauce|sos|ketchup|drink|juice|sok"
    r"|milk|mleko|cheese|sirenje|sir|cookies?|biscuits?|keks[ia]?|wafers?"
    r"|candy|gummi\w*|bar|cream|krem|spread|cereals?|muesli|pasta|butter|puter"
    r"|tea|[čc]aj|coffee|kafe|water|voda|јогурт|млеко|сирење|сир|чоколад[оа]"
    r"|кекс[и]?|крем|сок|вода|чај|кафе|путер|мајонез|кечап|сос)\b",
    re.IGNORECASE,
)

# "m.m" / "м.м." is mlečna mast (milk fat) on regional dairy; cocoa is the
# chocolate counterpart of a fat figure.
FAT_KEYWORD = (
    r"(?:fat|mm|мм|masti?|масти?|yndyr[eë]|fett|cocoa|kakao)\b|[mм]\.\s?[mм]\.?"
)
FIGURE = r"\d+(?:[.,]\d+)?"
INLINE_FAT = re.compile(
    rf"(?P<figure>{FIGURE})\s*%\s*(?P<keyword>{FAT_KEYWORD})", re.IGNORECASE
)
# OCR drops the "%" off a large stylised "2%", so the sign is optional here.
FAT_FIGURE = re.compile(rf"(?P<figure>{FIGURE})\s*%?")
LONE_FAT_KEYWORD = re.compile(FAT_KEYWORD, re.IGNORECASE)
SHOUTED_WORD = re.compile(r"(?:[^\W\d_]|['’·-])+")


@dataclass(frozen=True)
class FatPercentage:
    text: str
    # The separate box holding "FAT" or "m.m", which must not repeat as a word.
    keyword_box: Box | None


def _is_name_word(box: Box) -> bool:
    text = box.text.strip()
    return (
        sum(character.isalpha() for character in text) >= MIN_LETTERS
        and len(text.split()) <= MAX_WORDS
        and not mixes_scripts(text)
        and not any(pattern.search(text) for pattern in NOT_A_NAME)
    )


def _confidence_floor(box: Box) -> float:
    """Only twin letters split a score, so a word with no Cyrillic in it
    meets the Latin floor whichever reader returned it."""
    if CYRILLIC_LETTER.search(box.text):
        return MIN_CYRILLIC_CONFIDENCE
    return MIN_NAME_CONFIDENCE


def _distance(left: Box, right: Box) -> float:
    return math.hypot(left.x - right.x, left.y - right.y)


def _fat_text(figure: str, keyword: str) -> str:
    return f"{figure}% {keyword.lower()}"


def _inline_fat(box: Box) -> FatPercentage | None:
    match = INLINE_FAT.search(box.text)
    return (
        FatPercentage(_fat_text(match["figure"], match["keyword"]), None)
        if match
        else None
    )


def _split_fat(box: Box, boxes: tuple[Box, ...]) -> FatPercentage | None:
    """A figure whose nearest box is a fat keyword alone: "2,8%" beside "m.m"."""
    figure = FAT_FIGURE.fullmatch(box.text.strip())
    others = tuple(other for other in boxes if other is not box)
    if not figure or not others:
        return None
    nearest = min(others, key=lambda other: _distance(box, other))
    keyword = LONE_FAT_KEYWORD.fullmatch(nearest.text.strip())
    return (
        FatPercentage(_fat_text(figure["figure"], keyword[0]), nearest)
        if keyword
        else None
    )


def _fat_percentage(boxes: tuple[Box, ...], floor: float) -> FatPercentage | None:
    """Prominent only: a reference-intake badge's "Fat 13g 19%" is small print
    and a share of daily intake, not the variant."""
    readable = tuple(box for box in boxes if box.text.strip())
    readings = (
        _inline_fat(box) or _split_fat(box, readable)
        for box in readable
        if box.height >= floor
    )
    return next((reading for reading in readings if reading), None)


def _display_case(word: str) -> str:
    """ "HELLMANN'S" becomes "Hellmann's"; acronyms and mixed-case wordmarks
    ("KitKat", "m&m's") stay as printed."""
    letters = sum(character.isalpha() for character in word)
    shouted = (
        word.isupper()
        and letters >= MIN_SHOUTED_LETTERS
        and SHOUTED_WORD.fullmatch(word)
    )
    return word.capitalize() if shouted else word


def _reading_order(boxes: tuple[Box, ...]) -> list[Box]:
    """Top to bottom, left to right along a line. Shot at a slant, a line's
    right-hand word sits higher: Kosiljak's "Сланина" 19 px above "Домашна"."""
    lines: list[list[Box]] = []
    for box in sorted(boxes, key=lambda box: box.y):
        line_start = lines[-1][0] if lines else None
        if line_start and box.y - line_start.y < max(box.height, line_start.height) / 2:
            lines[-1].append(box)
        else:
            lines.append([box])
    return [box for line in lines for box in sorted(line, key=lambda box: box.x)]


def _name(result: OcrResult) -> str:
    """Prominent and product-type words in reading order, then the fat
    percentage."""
    confident = tuple(
        box for box in result.boxes if box.confidence >= _confidence_floor(box)
    )
    words = tuple(box for box in confident if _is_name_word(box))
    floor = PROMINENCE_RATIO * max((box.height for box in words), default=0.0)
    fat = _fat_percentage(confident, floor)
    fat_keyword_box = fat.keyword_box if fat else None
    kept = _reading_order(
        tuple(
            box
            for box in words
            if box is not fat_keyword_box
            and (box.height >= floor or PRODUCT_TYPE.search(box.text))
        )
    )
    parts = [box.text.strip() for box in kept] + ([fat.text] if fat else [])
    return " ".join(_display_case(word) for word in " ".join(parts).split())


def _folded(result: OcrResult) -> OcrResult:
    boxes = tuple(replace(box, text=fold_latin_twins(box.text)) for box in result.boxes)
    return replace(result, boxes=boxes)


def _is_cyrillic(name: str) -> bool:
    """Half the words is enough: a Latin brand often fronts a Cyrillic name
    ("bimilk Битолски јогурт"), while a Latin pack misread as Cyrillic loses
    one stylised word (Doritos' "NACHO" reads "ПАСНО")."""
    words = name.split()
    cyrillic = sum(bool(CYRILLIC_LETTER.search(word)) for word in words)
    return bool(words) and 2 * cyrillic >= len(words)


def extract_product_name(latin: OcrResult, cyrillic: OcrResult) -> str:
    """The name in the script the pack prints it in. The en reader returns
    Cyrillic as Latin lookalikes ("јогурт" reads "jorypt"), and the Cyrillic
    reader drops Latin diacritics, so each reads its own script."""
    cyrillic_name = _name(_folded(cyrillic))
    return cyrillic_name if _is_cyrillic(cyrillic_name) else _name(latin)


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
