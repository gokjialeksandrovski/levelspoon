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
    import dataclasses
    return dataclasses.replace(GOLDEN, **changes)
