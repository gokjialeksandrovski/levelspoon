"use client";

import { CarrotIcon } from "@phosphor-icons/react";
import { AnimatePresence, useReducedMotion } from "motion/react";
import * as motion from "motion/react-m";
import Link from "next/link";
import { Suspense, use, useEffect, useState } from "react";

import { restoreMealIngredient } from "@/features/meals/actions/meals";
import type { MealDetail as MealDetailData, MealIngredientDetail } from "@/features/meals/actions/meals";
import type { CalorieRemaining } from "@/features/goals/actions/goals.utils";
import { MacroLine } from "@/features/meals/components/macro-line";
import { AppHeader } from "@/components/layout/app-header";
import { buttonClassName } from "@/components/ui/button";
import { DelayedFallback } from "@/components/ui/delayed-fallback";
import { Disclosure } from "@/components/ui/disclosure";
import { InlineMessage } from "@/components/ui/inline-message";
import { LiveStatus } from "@/components/ui/live-status";
import { SettleNumber } from "@/components/ui/settle-number";
import { Skeleton } from "@/components/ui/skeleton";
import { contentFadeInitial, contentFadeTransition, listStaggerVariants } from "@/lib/motion/step-transition";
import { formatNumber } from "@/lib/nutrition/format-number";
import { fibreCoverage, fibreText } from "@/lib/nutrition/totals";

import { useCopiedIngredients, type CopiedIngredientsStore } from "./copied-ingredients";
import { COPY_LIMIT_MESSAGE, isCopied, toggleRow, type CopiedIngredient } from "./copied-ingredients.utils";
import { CookingFatControl } from "./cooking-fat-control";
import { CopyMealButton } from "./copy-meal-button";
import { DeleteMeal } from "./delete-meal";
import { PasteArea } from "./paste-area";
import { displayProductName, IngredientRow, RemovedIngredientRow, type RowCopy } from "./ingredient-row";
import { RecipeControl, RecipeDivergence, RecipeSubtitle } from "./recipe-control";
import { ShareMealButton } from "./share-meal-button";

// Read on the server and handed down unresolved, so the header and skeleton
// paint at once. A failed read resolves to "error" rather than rejecting.
export type MealLoad =
  | { status: "error" }
  | { status: "not-found" }
  | { status: "ready"; meal: MealDetailData };

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
// listEntries hides it again once a refresh shows the ingredient back, so Undo never flickers the row.
const useRemovals = (): UseRemovalsResult => {
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
    // restoreMealIngredient refreshes the route, which brings the row back.
    restoreMealIngredient(ingredientId)
      .then(() => {
        patch(ingredientId, { isRestoring: false });
        setAnnouncement("Ingredient put back.");
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

interface CopyControls {
  copied: CopiedIngredientsStore;
  onAnnounce: (message: string) => void;
  onFull: () => void;
}

// Local only: toggling writes the per-device list and sends no request.
const rowCopyFor = (ingredient: MealIngredientDetail, { copied, onAnnounce, onFull }: CopyControls): RowCopy => {
  const isRowCopied = isCopied(copied.items, ingredient.id);
  return {
    isCopied: isRowCopied,
    onToggle: () => {
      if (copied.replace(toggleRow(copied.items, ingredient)) === "full") {
        onFull();
        return;
      }
      const name = displayProductName(ingredient.productName);
      onAnnounce(isRowCopied ? `${name} taken off copied list.` : `${name} copied.`);
    },
  };
};

interface IngredientListProps {
  entries: ListEntry[];
  removals: UseRemovalsResult;
  copyControls: CopyControls;
}

// motion.ul orchestrates entrance stagger via variants; AnimatePresence
// (mode="popLayout") plays each row's own exit animation and lets siblings'
// `layout` reflow into the gap instead of snapping when one is removed.
const IngredientList = ({ entries, removals, copyControls }: IngredientListProps) => {
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
              copy={rowCopyFor(entry.ingredient, copyControls)}
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
      ({formatNumber(remaining.kcal)} kcal {label})
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
// between an add and this page's refresh.
const EmptyIngredients = () => <p className="mt-4 text-sm text-text-muted">No ingredients yet.</p>;

// Rendered inline rather than through notFound(): the read streams in under
// a 200 that has already been sent, so the status can no longer change.
const MealNotFound = () => (
  <div className="flex flex-col gap-3">
    <p className="text-sm text-text-muted">Meal not found.</p>
    <Link href="/" className="text-sm text-text underline">
      Back home
    </Link>
  </div>
);

// AppHeader needs a title and a Back target in every state, but the meal
// number and its day exist only once the read resolves. Until then the
// title is "Meal" and Back goes to "/", which redirects to today.
const mealDetailTitle = (load: MealLoad | null): string =>
  load?.status === "ready" ? `Meal ${load.meal.mealNumber}` : "Meal";

// Back returns to the meal's own local day, which may be a past day reached
// via History, not always today.
const mealDetailBackHref = (load: MealLoad | null): string =>
  load?.status === "ready" ? `/day/${load.meal.date}` : "/";

interface MealReadyBodyProps {
  meal: MealDetailData;
  mealId: string;
  removals: UseRemovalsResult;
  onAnnounce: (message: string) => void;
}

interface IngredientsSectionProps {
  meal: MealDetailData;
  removals: UseRemovalsResult;
  copyControls: CopyControls;
}

const IngredientsSection = ({ meal, removals, copyControls }: IngredientsSectionProps) => {
  const entries = listEntries(meal.ingredients, removals.removals);
  if (entries.length === 0) {
    return <EmptyIngredients />;
  }
  return (
    <>
      <IngredientList entries={entries} removals={removals} copyControls={copyControls} />
      {meal.ingredients.length > 0 && <MealTotal meal={meal} />}
    </>
  );
};

interface MealActionsProps {
  meal: MealDetailData;
  mealId: string;
  copyControls: CopyControls;
  isCopyFull: boolean;
  onAnnounce: (message: string) => void;
}

// The meal's own actions sit together; deleting the meal is a different kind of
// act, set apart by a hairline rather than a wide empty gap - the rule reads as
// "end of the meal's actions" and still keeps a thumb reaching for "Add" off it.
// The copy limit notice sits under the tray, where × and Clear make room.
const MealActions = ({ meal, mealId, copyControls, isCopyFull, onAnnounce }: MealActionsProps) => (
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
      <PasteArea mealId={mealId} />
      {isCopyFull && <InlineMessage tone="warning">{COPY_LIMIT_MESSAGE}</InlineMessage>}
      <CookingFatControl mealId={mealId} />
      <RecipeControl mealId={mealId} recipe={meal.recipe} ingredients={meal.ingredients} onAnnounce={onAnnounce} />
      <ShareMealButton meal={meal} onAnnounce={onAnnounce} />
      <CopyMealButton ingredients={meal.ingredients} {...copyControls} />
    </div>
    <DeleteMeal mealId={mealId} mealDate={meal.date} />
  </div>
);

interface UseCopyControlsResult {
  copyControls: CopyControls;
  isCopyFull: boolean;
}

// fullAt holds the list a copy was refused against. Any change to the list
// (×, Clear, a copy in another tab) is a new array, which retires the notice
// without a reset anywhere.
const useCopyControls = (onAnnounce: (message: string) => void): UseCopyControlsResult => {
  const copied = useCopiedIngredients();
  const [fullAt, setFullAt] = useState<readonly CopiedIngredient[] | null>(null);
  const onFull = () => {
    setFullAt(copied.items);
    onAnnounce(COPY_LIMIT_MESSAGE);
  };
  return { copyControls: { copied, onAnnounce, onFull }, isCopyFull: fullAt === copied.items };
};

const MealReadyBody = ({ meal, mealId, removals, onAnnounce }: MealReadyBodyProps) => {
  const { copyControls, isCopyFull } = useCopyControls(onAnnounce);

  return (
    <>
      {meal.recipe && (
        <div className="mb-4 flex flex-col gap-2">
          <RecipeDivergence recipe={meal.recipe} />
          <RecipeSubtitle recipe={meal.recipe} />
        </div>
      )}
      <IngredientsSection meal={meal} removals={removals} copyControls={copyControls} />
      <MealActions meal={meal} mealId={mealId} copyControls={copyControls} isCopyFull={isCopyFull} onAnnounce={onAnnounce} />
    </>
  );
};

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

interface MealDetailContentProps {
  load: MealLoad;
  mealId: string;
  removals: UseRemovalsResult;
  onAnnounce: (message: string) => void;
}

const MealDetailContent = ({ load, mealId, removals, onAnnounce }: MealDetailContentProps) => {
  if (load.status === "error") {
    return <p className="text-sm text-danger">Couldn&apos;t load this meal. Try again.</p>;
  }
  if (load.status === "not-found") {
    return <MealNotFound />;
  }
  return <MealReadyBody meal={load.meal} mealId={mealId} removals={removals} onAnnounce={onAnnounce} />;
};

interface MealScreenProps {
  load: MealLoad | null;
  children: React.ReactNode;
}

// One frame for the fallback and the loaded meal alike, so the header sits
// in the same place in both.
const MealScreen = ({ load, children }: MealScreenProps) => (
  <>
    <AppHeader variant="back" title={mealDetailTitle(load)} backHref={mealDetailBackHref(load)} />
    <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 focus:outline-none">
      {children}
    </main>
  </>
);

interface MealDetailLoadedProps {
  loadPromise: Promise<MealLoad>;
  mealId: string;
  removals: UseRemovalsResult;
  onAnnounce: (message: string) => void;
  onLoaded: (isLoaded: boolean) => void;
}

// Fades in once, on first reveal. A refresh after a write hands down a new
// promise inside a transition, so the meal on screen stays until the new
// one is ready and nothing remounts.
const MealDetailLoaded = ({ loadPromise, mealId, removals, onAnnounce, onLoaded }: MealDetailLoadedProps) => {
  const load = use(loadPromise);
  const reduceMotion = useReducedMotion();
  const isReady = load.status === "ready";
  useEffect(() => onLoaded(isReady), [isReady, onLoaded]);

  return (
    <MealScreen load={load}>
      <motion.div
        initial={contentFadeInitial(reduceMotion)}
        animate={{ opacity: 1 }}
        transition={contentFadeTransition(reduceMotion)}
      >
        <MealDetailContent load={load} mealId={mealId} removals={removals} onAnnounce={onAnnounce} />
      </motion.div>
    </MealScreen>
  );
};

// Long enough for a screen reader to finish a save/retro-update sentence.
// Judgment call, not a measured value - see RECIPE_ANNOUNCEMENT_CLEAR_MS's
// use below for why it must expire at all.
const RECIPE_ANNOUNCEMENT_CLEAR_MS = 4000;

interface MealDetailProps {
  mealId: string;
  load: Promise<MealLoad>;
}

export const MealDetail = ({ mealId, load }: MealDetailProps) => {
  const [recipeAnnouncement, setRecipeAnnouncement] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const removals = useRemovals();

  // A recipe save's announcement takes priority for a moment, never forever:
  // left unset-once-set it would permanently outrank every later removal/
  // undo announcement, silencing this page's live region for the rest of its
  // life (WCAG 4.1.3). Clearing it lets the `||` chain fall through again.
  useEffect(() => {
    if (!recipeAnnouncement) return;
    const timer = window.setTimeout(() => setRecipeAnnouncement(""), RECIPE_ANNOUNCEMENT_CLEAR_MS);
    return () => window.clearTimeout(timer);
  }, [recipeAnnouncement]);

  // The live region sits outside the Suspense boundary: it has to exist
  // before its text changes, and the meal mounts only once it is read. It
  // also covers the in-place refresh after an ingredient edit, which rewrites
  // the whole body with no navigation to announce it. A recipe save takes
  // priority over a removal's own announcement, but only for as long as
  // RECIPE_ANNOUNCEMENT_CLEAR_MS above.
  return (
    <>
      <LiveStatus message={recipeAnnouncement || removals.announcement || (isLoaded ? "Meal loaded" : "")} />
      <Suspense
        fallback={
          <MealScreen load={null}>
            <DelayedFallback>
              <MealDetailSkeleton />
            </DelayedFallback>
          </MealScreen>
        }
      >
        <MealDetailLoaded loadPromise={load} mealId={mealId} removals={removals} onAnnounce={setRecipeAnnouncement} onLoaded={setIsLoaded} />
      </Suspense>
    </>
  );
};
