// Thrown and caught inside recipes.ts only. A Server Action's thrown error
// reaches a client component as a bare Error with its subclass identity and
// every custom property stripped, so nothing outside this module ever sees
// these - each action maps them to its own result union instead. Naming them
// earns its keep because the actions discriminate on them (CLAUDE.md, "Named
// error types are judgment-only").
export class RecipeNotFoundError extends Error {
  constructor() {
    super("Recipe not found");
    this.name = "RecipeNotFoundError";
  }
}

export class MealNotFoundError extends Error {
  constructor() {
    super("Meal not found");
    this.name = "MealNotFoundError";
  }
}

export class InvalidRecipeNameError extends Error {
  constructor() {
    super("A recipe needs a name");
    this.name = "InvalidRecipeNameError";
  }
}

export class EmptyRecipeError extends Error {
  constructor() {
    super("A recipe needs at least one ingredient");
    this.name = "EmptyRecipeError";
  }
}
