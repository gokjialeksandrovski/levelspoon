from per100_ocr.nutrition.decimals import decimal_candidates, resolve_decimals

FIELD_ORDER = ("fat_g", "saturates_g", "carbohydrate_g", "sugars_g", "protein_g", "salt_g")


def test_unambiguous_value_has_one_candidate():
    assert decimal_candidates("2,0 g") == (2.0,)


def test_bare_two_digit_value_is_ambiguous():
    assert decimal_candidates("20g") == (20.0, 2.0)


def test_bare_two_digit_value_with_no_unit_is_ambiguous():
    """PaddleOCR can drop the unit suffix entirely, not just the decimal.

    Observed on the real Olympus label: saturates printed as "1,2 g" was
    read as bare "12", with no "g" at all.
    """
    assert decimal_candidates("12") == (12.0, 1.2)


def test_recovers_a_dropped_decimal_when_the_rules_demand_it():
    """'20g' fat cannot be right: saturates 1.2 <= fat, but Atwater rejects 20."""
    candidates = {
        "fat_g": (20.0, 2.0), "saturates_g": (1.2,), "carbohydrate_g": (4.0,),
        "sugars_g": (4.0,), "protein_g": (9.0,), "salt_g": (0.18,),
    }
    values, flags = resolve_decimals(candidates, energy_kcal=70.0, energy_kj=295.0)
    assert values.fat_g == 2.0
    assert flags == ()


def test_keeps_a_genuine_bare_integer_gram_value():
    """A real 72 g carbohydrate must not be corrupted into 7.2 g."""
    candidates = {
        "fat_g": (1.0,), "saturates_g": (0.5,), "carbohydrate_g": (72.0, 7.2),
        "sugars_g": (5.0,), "protein_g": (10.0,), "salt_g": (0.1,),
    }
    values, _ = resolve_decimals(candidates, energy_kcal=350.0, energy_kj=None)
    assert values.carbohydrate_g == 72.0


def test_flags_the_field_when_both_readings_satisfy_the_rules():
    """Ambiguity the rules cannot settle is surfaced, never guessed."""
    candidates = {
        "fat_g": (1.0,), "saturates_g": (0.5,), "carbohydrate_g": (4.0,),
        "sugars_g": (4.0,), "protein_g": (9.0,), "salt_g": (10.0, 1.0),
    }
    _, flags = resolve_decimals(candidates, energy_kcal=70.0, energy_kj=None)
    assert "salt_g" in flags


def test_flags_the_field_when_neither_reading_satisfies_the_rules():
    candidates = {
        "fat_g": (90.0, 9.0), "saturates_g": (95.0,), "carbohydrate_g": (4.0,),
        "sugars_g": (4.0,), "protein_g": (9.0,), "salt_g": (0.18,),
    }
    _, flags = resolve_decimals(candidates, energy_kcal=70.0, energy_kj=None)
    assert "fat_g" in flags


def test_recovers_multiple_simultaneously_ambiguous_fields():
    """Real Olympus photo: fat, carbohydrate and sugars all dropped their
    decimal at once. The old per-field loop tested one field at a time
    while its neighbours held their (also-wrong) initial reading, so the
    Atwater check never passed for any of them and all three ended up
    flagged instead of corrected. The composite-reading pass tries every
    field at its corrected candidate together, which is what actually
    resolves this."""
    candidates = {
        "fat_g": (20.0, 2.0), "saturates_g": (1.2,), "carbohydrate_g": (40.0, 4.0),
        "sugars_g": (40.0, 4.0), "protein_g": (9.0,), "salt_g": (0.18,),
    }
    values, flags = resolve_decimals(candidates, energy_kcal=70.0, energy_kj=295.0)
    assert (values.fat_g, values.carbohydrate_g, values.sugars_g) == (2.0, 4.0, 4.0)
    assert flags == ()
