import dataclasses

from per100_ocr.nutrition.validate import NutritionValues, validate

GOLDEN = NutritionValues(
    energy_kcal=70.0, fat_g=2.0, saturates_g=1.2,
    carbohydrate_g=4.0, sugars_g=4.0, protein_g=9.0, salt_g=0.18,
)


def test_golden_values_pass_every_rule():
    """The real corpus (spec §9.1) must be clean, or the gate is meaningless."""
    assert validate(GOLDEN, energy_kj=295.0) == ()


def test_flags_components_exceeding_one_hundred_grams():
    values = dataclasses_replace(fat_g=60.0, carbohydrate_g=50.0)
    flags = validate(values, energy_kj=None)
    assert "fat_g" in flags and "carbohydrate_g" in flags


def test_admits_rounding_drift_just_over_one_hundred_grams():
    """A correctly-read US label can legitimately sum just past 100g.

    FDA rounding (21 CFR 101.9(c)) rounds each macro on the *serving* to the
    nearest 0.5-1g, and scaling a small serving up to 100g multiplies that
    drift. A real 2-Tbsp/37g label reading 12g fat, 23g carb, 2g protein
    scales to 100.1g total - every field read perfectly. Flagging those four
    as unreadable is a false alarm the confirm step shows as an error.
    """
    values = dataclasses_replace(
        energy_kcal=540.5, fat_g=32.4, saturates_g=10.8,
        carbohydrate_g=62.2, sugars_g=56.8, protein_g=5.4, salt_g=0.1,
    )
    assert validate(values, energy_kj=None) == ()


def test_still_flags_components_past_the_rounding_tolerance():
    """The rule must keep catching a genuine misread, not just wave it through."""
    flags = validate(dataclasses_replace(fat_g=60.0, carbohydrate_g=50.0), energy_kj=None)
    assert "fat_g" in flags and "carbohydrate_g" in flags


def test_flags_saturates_above_fat():
    flags = validate(dataclasses_replace(saturates_g=5.0), energy_kj=None)
    assert "saturates_g" in flags and "fat_g" in flags


def test_flags_sugars_above_carbohydrate():
    flags = validate(dataclasses_replace(sugars_g=9.0), energy_kj=None)
    assert "sugars_g" in flags and "carbohydrate_g" in flags


def test_flags_energy_failing_the_atwater_check():
    flags = validate(dataclasses_replace(energy_kcal=400.0), energy_kj=None)
    assert "energy_kcal" in flags


def test_atwater_tolerance_admits_fibre_and_polyols():
    """4*4 + 9*2 + 4*9 = 70; 85 is inside the +-30% band (spec §4.4)."""
    assert "energy_kcal" not in validate(dataclasses_replace(energy_kcal=85.0), energy_kj=None)


def test_flags_kj_inconsistent_with_kcal():
    assert "energy_kcal" in validate(GOLDEN, energy_kj=1000.0)


def test_flags_negative_values():
    assert "protein_g" in validate(dataclasses_replace(protein_g=-1.0), energy_kj=None)


def test_flags_are_sorted_and_deduplicated():
    flags = validate(dataclasses_replace(saturates_g=5.0), energy_kj=None)
    assert list(flags) == sorted(set(flags))


def dataclasses_replace(**changes) -> NutritionValues:
    return dataclasses.replace(GOLDEN, **changes)


def test_absent_fibre_is_not_flagged_as_missing():
    """None means the label printed no fibre row - legal, not a misread."""
    values = dataclasses_replace(fibre_g=None)
    assert "fibre_g" not in validate(values)


def test_flags_negative_fibre():
    values = dataclasses_replace(fibre_g=-1.0)
    assert "fibre_g" in validate(values)


def test_component_total_counts_known_fibre():
    """Fibre sits outside the EU carbohydrate figure, so it adds to the sum."""
    values = dataclasses_replace(fat_g=30.0, carbohydrate_g=40.0, protein_g=25.0, salt_g=1.0, fibre_g=30.0)
    flags = validate(values)
    assert "fibre_g" in flags
    assert "carbohydrate_g" in flags


def test_component_total_ignores_absent_fibre():
    """energy_kcal set to match Atwater so only the component-total rule is under test."""
    values = dataclasses_replace(
        energy_kcal=530.0, fat_g=30.0, carbohydrate_g=40.0, protein_g=25.0, salt_g=1.0, fibre_g=None
    )
    assert validate(values) == ()


def test_fibre_above_carbohydrate_is_not_flagged():
    """EU convention puts fibre outside carbohydrate, so bran is legal."""
    values = dataclasses_replace(carbohydrate_g=20.0, fibre_g=40.0, fat_g=5.0, protein_g=15.0, salt_g=0.5)
    assert "fibre_g" not in validate(values)
