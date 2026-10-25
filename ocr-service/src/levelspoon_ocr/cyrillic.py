"""Repair what the Cyrillic reader (PaddleOCR lang='mk') returns.

Its dictionary holds Latin letters beside Cyrillic, and on stylised print it
mixes the two inside one word: "јогурт" comes back "jorypт". A Latin letter
inside a word that holds Cyrillic is a misread twin, so it maps back.
"""

import re

CYRILLIC_LETTER = re.compile("[Ѐ-ӿ]")
LATIN_LETTER = re.compile("[A-Za-z]")

LATIN_TWINS = str.maketrans(
    {
        "A": "А",
        "B": "В",
        "C": "С",
        "E": "Е",
        "H": "Н",
        "J": "Ј",
        "K": "К",
        "M": "М",
        "O": "О",
        "P": "Р",
        "T": "Т",
        "X": "Х",
        "Y": "У",
        "a": "а",
        "c": "с",
        "e": "е",
        "j": "ј",
        "k": "к",
        "o": "о",
        "p": "р",
        "x": "х",
        "y": "у",
        # Cursive forms: italic и, п, т, г print as u, n, m, r.
        "u": "и",
        "n": "п",
        "m": "т",
        "r": "г",
    }
)


def _fold_word(word: str) -> str:
    """Below the first letter a capital twin is a small letter: н, к and т
    print like small-caps H, K and T. An all-caps word stays all caps."""
    if not CYRILLIC_LETTER.search(word):
        return word
    folded = word.translate(LATIN_TWINS)
    return folded if folded.isupper() else folded[:1] + folded[1:].lower()


def fold_latin_twins(text: str) -> str:
    """ "jorypт" becomes "јогурт"; a word with no Cyrillic stays as read."""
    return " ".join(_fold_word(word) for word in text.split())


def mixes_scripts(text: str) -> bool:
    """After folding, a word holding both scripts is a misread past repair:
    b has no Cyrillic twin, so script-font "врвен" stays "врbеп"."""
    return any(
        CYRILLIC_LETTER.search(word) and LATIN_LETTER.search(word)
        for word in text.split()
    )
