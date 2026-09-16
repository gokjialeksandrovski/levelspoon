"use client";

import { CarrotIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getMealDetail } from "@/features/meals/actions/meals";
import type { MealDetail as MealDetailData, MealIngredientDetail } from "@/features/meals/actions/meals";
import { AppHeader } from "@/components/layout/app-header";
import { buttonClassName } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { todayLocalDateString } from "@/lib/date/day-bounds";
import { contentFadeInitial, contentFadeTransition } from "@/lib/motion/step-transition";
import { useDelayedSkeleton } from "@/lib/motion/use-delayed-skeleton";

import { CookingFatControl } from "./cooking-fat-control";
import { DeleteMeal } from "./delete-meal";
import { IngredientRow } from "./ingredient-row";
import { MacroLine, SettleNumber } from "./macro-line";

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
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    getMealDetail(mealId, timezone)
      .then((meal) => setState(meal ? { status: "ready", meal } : { status: "not-found" }))
      .catch(() => setState({ status: "error" }));
  }, [mealId]);

  useEffect(() => {
    load();
  }, [load, reloadCounter]);

  return state;
};

interface IngredientListProps {
  ingredients: MealIngredientDetail[];
  onIngredientChanged: () => void;
}

// 30-50ms per-row stagger per the motion spec; 40ms sits at the mid-point.
const ROW_STAGGER_SECONDS = 0.04;

const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: ROW_STAGGER_SECONDS } },
};

// motion.ul orchestrates entrance stagger via variants; AnimatePresence
// (mode="popLayout") plays each row's own exit animation and lets siblings'
// `layout` reflow into the gap instead of snapping when one is removed.
const IngredientList = ({ ingredients, onIngredientChanged }: IngredientListProps) => {
  const reduceMotion = useReducedMotion();

  return (
    <motion.ul
      className="divide-y divide-border"
      initial={reduceMotion ? false : "hidden"}
      animate="visible"
      variants={listVariants}
    >
      <AnimatePresence mode="popLayout">
        {ingredients.map((ingredient) => (
          <IngredientRow key={ingredient.id} ingredient={ingredient} onChanged={onIngredientChanged} />
        ))}
      </AnimatePresence>
    </motion.ul>
  );
};

// The three EU-label fields the app already computes but doesn't surface at
// meal level (energy/fat/carb/protein cover the rest via MacroLine above).
// Salt gets a fixed 1 decimal - most real foods sit under 1g, where
// Math.round would read as "0g" for everything.
const NutritionDetail = ({ total }: { total: MealDetailData["total"] }) => {
  const reduceMotion = useReducedMotion();

  return (
    <p className="mt-1 tabular-nums text-sm text-text-muted">
      Saturates <SettleNumber value={Math.round(total.saturatesG)} reduceMotion={reduceMotion} />g
      {" · "}
      Sugars <SettleNumber value={Math.round(total.sugarsG)} reduceMotion={reduceMotion} />g
      {" · "}
      Salt <SettleNumber value={total.saltG.toFixed(1)} reduceMotion={reduceMotion} />g
    </p>
  );
};

// border-t-2 (double the divide-y hairline between ingredient rows) plus
// extra top margin marks this as a summary, not one more ingredient row.
const MealTotal = ({ total }: { total: MealDetailData["total"] }) => {
  const reduceMotion = useReducedMotion();

  return (
    <div className="mt-6 border-t-2 border-border pt-3">
      <p className="flex items-baseline justify-between text-sm text-text-muted">
        <span>Meal total</span>
        <span className="tabular-nums text-base font-semibold text-text">
          <SettleNumber value={Math.round(total.energyKcal)} reduceMotion={reduceMotion} /> kcal
        </span>
      </p>
      <MacroLine contribution={total} size="sm" animate />
      <div className="mt-1">
        <Disclosure label="Saturates, sugars & salt">
          <NutritionDetail total={total} />
        </Disclosure>
      </div>
    </div>
  );
};

// Transient: a meal briefly has zero ingredients between an add and this
// page's refetch. discardEmptyMeal sweeps truly-abandoned ones server-side.
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
  onIngredientChanged: () => void;
}

interface IngredientsSectionProps {
  ingredients: MealIngredientDetail[];
  total: MealDetailData["total"];
  onIngredientChanged: () => void;
}

const IngredientsSection = ({ ingredients, total, onIngredientChanged }: IngredientsSectionProps) =>
  ingredients.length > 0 ? (
    <>
      <IngredientList ingredients={ingredients} onIngredientChanged={onIngredientChanged} />
      <MealTotal total={total} />
    </>
  ) : (
    <EmptyIngredients />
  );

interface MealActionsProps {
  mealId: string;
  mealDate: string;
  onIngredientChanged: () => void;
}

const MealActions = ({ mealId, mealDate, onIngredientChanged }: MealActionsProps) => (
  <div className="mt-6 flex flex-col gap-3">
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
    <DeleteMeal mealId={mealId} mealDate={mealDate} />
  </div>
);

const MealReadyBody = ({ meal, mealId, onIngredientChanged }: MealReadyBodyProps) => (
  <>
    <IngredientsSection
      ingredients={meal.ingredients}
      total={meal.total}
      onIngredientChanged={onIngredientChanged}
    />
    <MealActions mealId={mealId} mealDate={meal.date} onIngredientChanged={onIngredientChanged} />
  </>
);

interface MealDetailBodyProps {
  state: MealDetailState;
  mealId: string;
  onIngredientChanged: () => void;
}

interface MealDetailContentProps {
  state: Exclude<MealDetailState, { status: "loading" }>;
  mealId: string;
  onIngredientChanged: () => void;
}

const MealDetailContent = ({ state, mealId, onIngredientChanged }: MealDetailContentProps) => {
  if (state.status === "error") {
    return <p className="text-sm text-danger">Couldn&apos;t load this meal. Try again.</p>;
  }
  if (state.status === "not-found") {
    return <MealNotFound />;
  }

  return <MealReadyBody meal={state.meal} mealId={mealId} onIngredientChanged={onIngredientChanged} />;
};

// Same delayed-skeleton + fade-in treatment as DayViewBody/HistoryBody, so
// a fast fetch doesn't flash "Loading…" then jump-cut to content.
const MealDetailBody = ({ state, mealId, onIngredientChanged }: MealDetailBodyProps) => {
  const reduceMotion = useReducedMotion();
  const showSkeleton = useDelayedSkeleton(state.status === "loading");

  if (state.status === "loading") {
    return showSkeleton ? <p className="text-sm text-text-muted">Loading…</p> : null;
  }

  return (
    <motion.div
      initial={contentFadeInitial(reduceMotion)}
      animate={{ opacity: 1 }}
      transition={contentFadeTransition(reduceMotion)}
    >
      <MealDetailContent state={state} mealId={mealId} onIngredientChanged={onIngredientChanged} />
    </motion.div>
  );
};

export const MealDetail = ({ mealId }: MealDetailProps) => {
  const [reloadCounter, setReloadCounter] = useState(0);
  const bumpReload = () => setReloadCounter((count) => count + 1);
  const state = useMealDetail(mealId, reloadCounter);
  const today = todayLocalDateString(Intl.DateTimeFormat().resolvedOptions().timeZone);

  return (
    <>
      <AppHeader variant="back" title={mealDetailTitle(state)} backHref={mealDetailBackHref(state, today)} />
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 focus:outline-none">
        <MealDetailBody state={state} mealId={mealId} onIngredientChanged={bumpReload} />
      </main>
    </>
  );
};
