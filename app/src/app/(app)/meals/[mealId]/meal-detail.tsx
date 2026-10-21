"use client";

import { CarrotIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getMealDetail, restoreMealIngredient } from "@/features/meals/actions/meals";
import type { MealDetail as MealDetailData, MealIngredientDetail, MealRecipeLink } from "@/features/meals/actions/meals";
import type { CalorieRemaining } from "@/features/goals/actions/goals.utils";
import { MacroLine } from "@/features/meals/components/macro-line";
import { AppHeader } from "@/components/layout/app-header";
import { buttonClassName } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { LiveStatus } from "@/components/ui/live-status";
import { SettleNumber } from "@/components/ui/settle-number";
import { Skeleton } from "@/components/ui/skeleton";
import { todayLocalDateString } from "@/lib/date/day-bounds";
import { contentFadeInitial, contentFadeTransition, listStaggerVariants } from "@/lib/motion/step-transition";
import { useDelayedSkeleton } from "@/lib/motion/use-delayed-skeleton";
import { fibreCoverage, fibreText } from "@/lib/nutrition/totals";

import { CookingFatControl } from "./cooking-fat-control";
import { DeleteMeal } from "./delete-meal";
import { IngredientRow, RemovedIngredientRow } from "./ingredient-row";
import { RecipeControl, RecipeDivergence, RecipeSubtitle } from "./recipe-control";

type MealDetailState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "ready"; meal: MealDetailData };

// Sets state only from the fetch's `.then`/`.catch`, never synchronously in
// the effect body (react-hooks/set-state-in-effect flags that as an error).
// `reloadCounter` is a bump signal in the dependency array: an in-place
// ingredient edit reuses this Client Component instance, so a mount-only
// effect would miss the change.
const useMealDetail = (mealId: string, reloadCounter: number): MealDetailState => {
  const [state, setState] = useState<MealDetailState>({ status: "loading" });

  const load = useCallback(() => {
    getMealDetail(mealId)
      .then((meal) => setState(meal ? { status: "ready", meal } : { status: "not-found" }))
      .catch(() => setState({ status: "error" }));
  }, [mealId]);

  useEffect(() => {
    load();
  }, [load, reloadCounter]);

  return state;
};

interface Removal {
  ingredient: MealIngredientDetail;
  // Position in the displayed list when removed, so Undo sits where the row was.
  index: number;
  isRestoring: boolean;
  error: string | null;
}

interface UseRemovalsResult {
  removals: Removal[];
  announcement: string;
  markRemoved: (ingredient: MealIngredientDetail, index: number) => void;
  undo: (ingredientId: string) => void;
  dismiss: (ingredientId: string) => void;
}

// A removal stays listed until the page leaves or the user dismisses it;
// listEntries hides it again once a refetch shows the ingredient back, so Undo never flickers the row.
const useRemovals = (onRestored: () => void): UseRemovalsResult => {
  const [removals, setRemovals] = useState<Removal[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const patch = (ingredientId: string, change: Partial<Removal>) =>
    setRemovals((list) => list.map((removal) => (removal.ingredient.id === ingredientId ? { ...removal, ...change } : removal)));

  const markRemoved = (ingredient: MealIngredientDetail, index: number) => {
    setRemovals((list) => [...list.filter((removal) => removal.ingredient.id !== ingredient.id), { ingredient, index, isRestoring: false, error: null }]);
    setAnnouncement(`${ingredient.productName} removed. Undo is in its place.`);
  };

  const undo = (ingredientId: string) => {
    patch(ingredientId, { isRestoring: true, error: null });
    restoreMealIngredient(ingredientId)
      .then(() => {
        patch(ingredientId, { isRestoring: false });
        setAnnouncement("Ingredient put back.");
        onRestored();
      })
      .catch(() => patch(ingredientId, { isRestoring: false, error: "Couldn't put it back. Try again." }));
  };

  // Local only: the ingredient stays soft-deleted. Focus goes to the skip-link
  // target, not <body>, with the unmounted button.
  const dismiss = (ingredientId: string) => {
    setRemovals((list) => list.filter((removal) => removal.ingredient.id !== ingredientId));
    document.getElementById("main-content")?.focus();
  };

  return { removals, announcement, markRemoved, undo, dismiss };
};

type ListEntry = { kind: "present"; ingredient: MealIngredientDetail } | { kind: "removed"; removal: Removal };

const listEntries = (ingredients: MealIngredientDetail[], removals: Removal[]): ListEntry[] => {
  const presentIds = new Set(ingredients.map((ingredient) => ingredient.id));
  return removals
    .filter((removal) => !presentIds.has(removal.ingredient.id))
    .reduce<ListEntry[]>(
      (entries, removal) => [...entries.slice(0, removal.index), { kind: "removed", removal }, ...entries.slice(removal.index)],
      ingredients.map((ingredient) => ({ kind: "present", ingredient })),
    );
};

interface IngredientListProps {
  entries: ListEntry[];
  removals: UseRemovalsResult;
  onIngredientChanged: () => void;
}

// motion.ul orchestrates entrance stagger via variants; AnimatePresence
// (mode="popLayout") plays each row's own exit animation and lets siblings'
// `layout` reflow into the gap instead of snapping when one is removed.
const IngredientList = ({ entries, removals, onIngredientChanged }: IngredientListProps) => {
  const reduceMotion = useReducedMotion();

  return (
    <motion.ul
      className="divide-y divide-border"
      initial={reduceMotion ? false : "hidden"}
      animate="visible"
      variants={listStaggerVariants}
    >
      <AnimatePresence mode="popLayout">
        {entries.map((entry, index) =>
          entry.kind === "present" ? (
            <IngredientRow
              key={entry.ingredient.id}
              ingredient={entry.ingredient}
              onChanged={onIngredientChanged}
              onRemoved={() => removals.markRemoved(entry.ingredient, index)}
            />
          ) : (
            <RemovedIngredientRow
              key={`removed-${entry.removal.ingredient.id}`}
              productName={entry.removal.ingredient.productName}
              isRestoring={entry.removal.isRestoring}
              error={entry.removal.error}
              onUndo={() => removals.undo(entry.removal.ingredient.id)}
              onDismiss={() => removals.dismiss(entry.removal.ingredient.id)}
            />
          ),
        )}
      </AnimatePresence>
    </motion.ul>
  );
};

// The EU-label fields the app already computes but doesn't surface at
// meal level (energy/fat/carb/protein cover the rest via MacroLine above).
// Salt gets a fixed 1 decimal - most real foods sit under 1g, where
// Math.round would read as "0g" for everything.
const NutritionDetail = ({ meal }: { meal: MealDetailData }) => {
  const { total } = meal;
  const reduceMotion = useReducedMotion();

  return (
    <p className="mt-1 tabular-nums text-sm text-text-muted">
      Saturates <SettleNumber value={Math.round(total.saturatesG)} reduceMotion={reduceMotion} />g
      {" · "}
      Sugars <SettleNumber value={Math.round(total.sugarsG)} reduceMotion={reduceMotion} />g
      {" · "}
      Salt <SettleNumber value={total.saltG.toFixed(1)} reduceMotion={reduceMotion} />g
      {" · "}
      {fibreText(total.fibreG, fibreCoverage(meal.ingredients.map((ingredient) => ingredient.contribution)))}
    </p>
  );
};

// Same day-wide number the home hero shows - omitted entirely when no goal
// is set, so a meal in an unset-goal day doesn't imply a target that isn't there.
const DayRemainingBracket = ({ remaining }: { remaining: CalorieRemaining }) => {
  if (remaining.status === "unset") {
    return null;
  }
  const label = remaining.status === "over" ? "over" : "left";
  return (
    <span className={`ml-1 font-normal ${remaining.status === "over" ? "text-danger" : "text-text-muted"}`}>
      ({remaining.kcal.toLocaleString()} kcal {label})
    </span>
  );
};

// border-t-2 (double the divide-y hairline between ingredient rows) plus
// extra top margin marks this as a summary, not one more ingredient row.
const MealTotal = ({ meal }: { meal: MealDetailData }) => {
  const { total, dayCalorieRemaining } = meal;
  const reduceMotion = useReducedMotion();

  return (
    <div className="mt-6 border-t-2 border-border pt-3">
      <p className="flex items-baseline justify-between text-sm text-text-muted">
        <span>Meal total</span>
        <span className="tabular-nums text-base font-semibold text-text">
          <SettleNumber value={Math.round(total.energyKcal)} reduceMotion={reduceMotion} /> kcal
          <DayRemainingBracket remaining={dayCalorieRemaining} />
        </span>
      </p>
      <MacroLine contribution={total} size="sm" animate />
      <div className="mt-1">
        <Disclosure label="Saturates, sugars, salt & fibre">
          <NutritionDetail meal={meal} />
        </Disclosure>
      </div>
    </div>
  );
};

// Reached when every ingredient was removed and the page reloaded, or briefly
// between an add and this page's refetch.
const EmptyIngredients = () => <p className="mt-4 text-sm text-text-muted">No ingredients yet.</p>;

// notFound() (next/navigation) only works in a Server Component - this is a
// Client Component, so a not-found meal renders inline instead.
const MealNotFound = () => (
  <div className="flex flex-col gap-3">
    <p className="text-sm text-text-muted">Meal not found.</p>
    <Link href="/" className="text-sm text-text underline">
      Back home
    </Link>
  </div>
);

interface MealDetailProps {
  mealId: string;
}

// AppHeader's title needs a value in every state, but the meal number only
// exists once the fetch resolves - "Meal" is the interim label for
// loading/error/not-found.
const mealDetailTitle = (state: MealDetailState): string =>
  state.status === "ready" ? `Meal ${state.meal.mealNumber}` : "Meal";

// Mirrors mealDetailTitle's pattern: Back should return to the meal's own
// local day (which may be a day in the past, reached via History), not
// always today - but that date only exists once the fetch resolves, so
// today is the interim fallback for loading/error/not-found.
const mealDetailBackHref = (state: MealDetailState, today: string): string =>
  `/day/${state.status === "ready" ? state.meal.date : today}`;

interface MealReadyBodyProps {
  meal: MealDetailData;
  mealId: string;
  removals: UseRemovalsResult;
  onIngredientChanged: () => void;
  onAnnounce: (message: string) => void;
}

type IngredientsSectionProps = Omit<MealReadyBodyProps, "mealId" | "onAnnounce">;

const IngredientsSection = ({ meal, removals, onIngredientChanged }: IngredientsSectionProps) => {
  const entries = listEntries(meal.ingredients, removals.removals);
  if (entries.length === 0) {
    return <EmptyIngredients />;
  }
  return (
    <>
      <IngredientList entries={entries} removals={removals} onIngredientChanged={onIngredientChanged} />
      {meal.ingredients.length > 0 && <MealTotal meal={meal} />}
    </>
  );
};

interface MealActionsProps {
  mealId: string;
  mealDate: string;
  recipe: MealRecipeLink | null;
  ingredients: MealIngredientDetail[];
  onIngredientChanged: () => void;
  onAnnounce: (message: string) => void;
}

// Two adding actions sit together; deleting the meal is a different kind of
// act, set apart by a hairline rather than a wide empty gap - the rule reads as
// "end of the meal's actions" and still keeps a thumb reaching for "Add" off it.
const MealActions = ({ mealId, mealDate, recipe, ingredients, onIngredientChanged, onAnnounce }: MealActionsProps) => (
  <div className="mt-8 flex flex-col gap-6">
    <div className="flex flex-col gap-3">
      {/*
        A plain navigation link, not an inline reveal: the capture wizard
        owns the full-screen /capture route now, and returning from it
        remounts this page rather than refreshing it in place.
      */}
      <Link
        href={`/meals/${mealId}/capture`}
        className={buttonClassName("primary", "inline-flex items-center justify-center gap-2 text-center")}
      >
        <CarrotIcon size={20} />
        Add ingredient
      </Link>
      <CookingFatControl mealId={mealId} onIngredientChanged={onIngredientChanged} />
      <RecipeControl mealId={mealId} recipe={recipe} ingredients={ingredients} onChanged={onIngredientChanged} onAnnounce={onAnnounce} />
    </div>
    <DeleteMeal mealId={mealId} mealDate={mealDate} />
  </div>
);

const MealReadyBody = ({ meal, mealId, removals, onIngredientChanged, onAnnounce }: MealReadyBodyProps) => (
  <>
    {meal.recipe && (
      <div className="mb-4 flex flex-col gap-2">
        <RecipeDivergence recipe={meal.recipe} />
        <RecipeSubtitle recipe={meal.recipe} />
      </div>
    )}
    <IngredientsSection meal={meal} removals={removals} onIngredientChanged={onIngredientChanged} />
    <MealActions
      mealId={mealId}
      mealDate={meal.date}
      recipe={meal.recipe}
      ingredients={meal.ingredients}
      onIngredientChanged={onIngredientChanged}
      onAnnounce={onAnnounce}
    />
  </>
);

const SKELETON_ROW_COUNT = 3;

// Mirrors an IngredientRow (name over amount line) and the meal total, the
// same shape-matched placeholder DayView and History use.
const MealDetailSkeleton = () => (
  <div>
    <div className="divide-y divide-border">
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
        <div key={`meal-skeleton-${index}`} className="flex flex-col gap-2 py-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      ))}
    </div>
    <div className="mt-6 flex items-baseline justify-between border-t-2 border-border pt-3">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-16" />
    </div>
  </div>
);

interface MealDetailBodyProps {
  state: MealDetailState;
  mealId: string;
  removals: UseRemovalsResult;
  onIngredientChanged: () => void;
  onAnnounce: (message: string) => void;
}

interface MealDetailContentProps extends Omit<MealDetailBodyProps, "state"> {
  state: Exclude<MealDetailState, { status: "loading" }>;
}

const MealDetailContent = ({ state, mealId, removals, onIngredientChanged, onAnnounce }: MealDetailContentProps) => {
  if (state.status === "error") {
    return <p className="text-sm text-danger">Couldn&apos;t load this meal. Try again.</p>;
  }
  if (state.status === "not-found") {
    return <MealNotFound />;
  }

  return (
    <MealReadyBody meal={state.meal} mealId={mealId} removals={removals} onIngredientChanged={onIngredientChanged} onAnnounce={onAnnounce} />
  );
};

// Same delayed-skeleton + fade-in treatment as DayViewBody/HistoryBody, so
// a fast fetch doesn't flash a placeholder then jump-cut to content.
const MealDetailBody = ({ state, mealId, removals, onIngredientChanged, onAnnounce }: MealDetailBodyProps) => {
  const reduceMotion = useReducedMotion();
  const showSkeleton = useDelayedSkeleton(state.status === "loading");

  if (state.status === "loading") {
    return showSkeleton ? <MealDetailSkeleton /> : null;
  }

  return (
    <motion.div
      initial={contentFadeInitial(reduceMotion)}
      animate={{ opacity: 1 }}
      transition={contentFadeTransition(reduceMotion)}
    >
      <MealDetailContent state={state} mealId={mealId} removals={removals} onIngredientChanged={onIngredientChanged} onAnnounce={onAnnounce} />
    </motion.div>
  );
};

// Long enough for a screen reader to finish a save/retro-update sentence.
// Judgment call, not a measured value - see RECIPE_ANNOUNCEMENT_CLEAR_MS's
// use below for why it must expire at all.
const RECIPE_ANNOUNCEMENT_CLEAR_MS = 4000;

export const MealDetail = ({ mealId }: MealDetailProps) => {
  const [reloadCounter, setReloadCounter] = useState(0);
  const [recipeAnnouncement, setRecipeAnnouncement] = useState("");
  const bumpReload = () => setReloadCounter((count) => count + 1);
  const state = useMealDetail(mealId, reloadCounter);
  const removals = useRemovals(bumpReload);
  const today = todayLocalDateString(Intl.DateTimeFormat().resolvedOptions().timeZone);

  // A recipe save's announcement takes priority for a moment, never forever:
  // left unset-once-set it would permanently outrank every later removal/
  // undo announcement, silencing this page's live region for the rest of its
  // life (WCAG 4.1.3). Clearing it lets the `||` chain fall through again.
  useEffect(() => {
    if (!recipeAnnouncement) return;
    const timer = window.setTimeout(() => setRecipeAnnouncement(""), RECIPE_ANNOUNCEMENT_CLEAR_MS);
    return () => window.clearTimeout(timer);
  }, [recipeAnnouncement]);

  return (
    <>
      <AppHeader variant="back" title={mealDetailTitle(state)} backHref={mealDetailBackHref(state, today)} />
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 focus:outline-none">
        {/* Also covers the in-place refetch after an ingredient edit, which
            rewrites the whole body with no navigation to announce it. A
            recipe save takes priority over a removal's own announcement,
            but only for as long as RECIPE_ANNOUNCEMENT_CLEAR_MS above. */}
        <LiveStatus message={recipeAnnouncement || removals.announcement || (state.status === "ready" ? "Meal loaded" : "")} />
        <MealDetailBody state={state} mealId={mealId} removals={removals} onIngredientChanged={bumpReload} onAnnounce={setRecipeAnnouncement} />
      </main>
    </>
  );
};
