"""Read a nutrition declaration printed as running text, not as a table.

Small-run labels (cured meat, local dairy) print the declaration as a
sentence: "Përmbajtja e yndyrës 22.0% Karbohidratet 0.60% Sheqerna 0.11%".
No value column exists for the table parser to anchor on, so each figure is
tied to the nearest field keyword before it instead.
"""

import re
from dataclasses import dataclass

from ..boxes import Box, OcrResult, cluster_columns
from .columns import PER_100_HEADER, ColumnDetectionError
from .normalize import ENERGY_FIGURE

LETTERS = r"[^\W\d_]*"

# Latin-script spellings only (English, Albanian, Serbian/Croatian/Bosnian):
# the engine's 'en' model returns Cyrillic words as blanks, so Cyrillic
# keywords would never match. Saturates comes first and swallows a following
# "fat", so "saturated fat" is one keyword rather than saturates then fat.
# Albanian "yndyrore" (fatty, as in "acidet yndyrore") is not the fat noun.
# A figure is any number with a mass unit; "%" is grams per 100 g, which is
# how Albanian declarations print it.
TOKENS = re.compile(
    rf"(?P<saturates_g>saturate[ds]?(?:\s+fat)?|ngopur{LETTERS}|zasi[cćč]en{LETTERS})"
    rf"|(?P<fat_g>\bfat\b|yndyr(?!or){LETTERS}|\bmast{LETTERS})"
    rf"|(?P<sugars_g>\bsugars?\b|she[qg]er{LETTERS}|[sš]e[cćč]er{LETTERS})"
    rf"|(?P<carbohydrate_g>carbohydrate{LETTERS}|karbohidrat{LETTERS}"
    rf"|uglj{LETTERS}\s*hidrat{LETTERS}|ugljikohidrat{LETTERS})"
    rf"|(?P<fibre_g>\bfib(?:er|re)s?\b|\bfibra{LETTERS}|vlakn{LETTERS})"
    rf"|(?P<protein_g>protein{LETTERS}|bjelan{LETTERS})"
    rf"|(?P<salt_g>\bsalt\b|krip{LETTERS}|\bnacl\b|\bsol\b)"
    r"|(?P<figure>(?<![\d.,])\d+(?:[.,]\d+)?\s*(?:mg|g|%))",
    re.IGNORECASE,
)
FIGURE = "figure"

# The basis ("na 100g", "kCal/100g") is no field's figure.
BASIS_PHRASE = re.compile(r"(?<![\d.,])100\s*(?:ml|g)", re.IGNORECASE)

MANDATORY_FIELDS = (
    "fat_g",
    "saturates_g",
    "carbohydrate_g",
    "sugars_g",
    "protein_g",
    "salt_g",
)

# Below this many of the six mandatory macros, the text is more likely a
# claim on the pack ("20 g protein") than a declaration.
MIN_DECLARED_FIELDS = 4


@dataclass(frozen=True)
class Declaration:
    """One running-text declaration as printed: raw figure text per field."""

    figures: dict[str, str]
    energy_kcal: float | None
    energy_kj: float | None
    basis_unit: str


def names_a_field(text: str) -> bool:
    """True when the text carries a nutrient keyword, as running text does
    and a table's value cell never does."""
    return any(match.lastgroup != FIGURE for match in TOKENS.finditer(text))


def _figures_by_field(text: str) -> dict[str, str]:
    """Each field's first figure, claimed by the nearest keyword before it.

    ponytail: first claim wins, so a QUID percentage in an ingredient list
    ("sugar 2%") ahead of the declaration is taken for the nutrient. The
    validation rules and the confirm step are the net; skip the ingredient
    list explicitly once a real label shows it.
    """
    claimed: dict[str, str] = {}
    keyword: str | None = None
    for match in TOKENS.finditer(BASIS_PHRASE.sub(" ", ENERGY_FIGURE.sub(" ", text))):
        if match.lastgroup != FIGURE:
            keyword = match.lastgroup
        elif keyword is not None:
            claimed.setdefault(keyword, match.group())
            keyword = None
    return claimed


def _energy(text: str) -> dict[str, float]:
    """The first kcal and the first kJ figure, by unit."""
    found: dict[str, float] = {}
    for number, unit in ENERGY_FIGURE.findall(text):
        found.setdefault(unit.lower(), float(number.replace(",", ".")))
    return found


def _declared_count(figures: dict[str, str]) -> int:
    return sum(field in figures for field in MANDATORY_FIELDS)


def _column_text(column: tuple[Box, ...]) -> str:
    """One column's lines top to bottom. Columns, not the whole photo: a
    bilingual label prints its languages side by side, and interleaving their
    lines would put one language's figure after the other's keyword."""
    return " ".join(box.text for box in column)


def read_declaration(result: OcrResult) -> Declaration:
    """The column whose text declares the most mandatory figures.

    The text must state its per-100 basis: figures with none may be per
    portion, and reading them as per 100 g would scale every meal wrong.
    """
    texts = [
        _column_text(column)
        for column in cluster_columns(result.boxes, result.image_width)
    ]
    best = max(
        texts, key=lambda text: _declared_count(_figures_by_field(text)), default=""
    )
    figures = _figures_by_field(best)
    basis = PER_100_HEADER.search(best)

    if _declared_count(figures) < MIN_DECLARED_FIELDS or basis is None:
        raise ColumnDetectionError(
            "No per-100 table and no running-text declaration found among "
            f"{len(result.boxes)} detected boxes"
        )
    energy = _energy(best)
    return Declaration(
        figures=figures,
        energy_kcal=energy.get("kcal"),
        energy_kj=energy.get("kj"),
        basis_unit=basis.group(1).lower(),
    )
