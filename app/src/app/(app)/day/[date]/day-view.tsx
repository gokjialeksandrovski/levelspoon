"use client";

import { motion, useDragControls, useReducedMotion, type HTMLMotionProps, type PanInfo } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { getDayLog, restoreMeal } from "@/features/meals/actions/meals";
import type { DayLog } from "@/features/meals/actions/meals";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";
import { LiveStatus } from "@/components/ui/live-status";
import { Skeleton } from "@/components/ui/skeleton";
import { addCalendarDays, todayLocalDateString } from "@/lib/date/day-bounds";
import { contentFadeInitial, contentFadeTransition, slideInitial, slideTransition } from "@/lib/motion/step-transition";
import { useDelayedSkeleton } from "@/lib/motion/use-delayed-skeleton";

import { CalorieHero } from "./calorie-hero";
import { DayActionBar } from "./day-action-bar";
import { DayEmptyState } from "./day-empty-state";
import { DayMacros } from "./day-macros";
import { MealList } from "./meal-list";

interface DayViewProps {
  date: string;
  deletedMealId: string | null;
}

type DayViewState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; log: DayLog; isToday: boolean };

// setState only inside .then/.catch, never synchronously in the effect body -
// react-hooks/set-state-in-effect flags that as an error even for a "reset to
// loading" call.
const useDayLog = (date: string, reloadCounter: number): DayViewState => {
  const [state, setState] = useState<DayViewState>({ status: "loading" });

  const load = useCallback(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    getDayLog(date, timezone)
      .then((log) => setState({ status: "ready", log, isToday: date === todayLocalDateString(timezone) }))
      .catch(() => setState({ status: "error" }));
  }, [date]);

  useEffect(() => {
    load();
  }, [load, reloadCounter]);

  return state;
};

interface DeletedMeal {
  mealId: string | null;
  isRestoring: boolean;
  error: string | null;
  undo: () => void;
}

// The id is copied into state and the ?deleted= param dropped from the URL at
// once, so a reload or a shared link never offers Undo for a stale delete.
const useDeletedMeal = (date: string, deletedMealId: string | null, onRestored: () => void): DeletedMeal => {
  const [mealId, setMealId] = useState(deletedMealId);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (deletedMealId) window.history.replaceState(null, "", `/day/${date}`);
  }, [date, deletedMealId]);

  const undo = () => {
    if (!mealId) return;
    setIsRestoring(true);
    setError(null);
    restoreMeal(mealId)
      .then(() => {
        setMealId(null);
        onRestored();
      })
      .catch(() => setError("Couldn't bring the meal back. Try again."))
      .finally(() => setIsRestoring(false));
  };

  return { mealId, isRestoring, error, undo };
};

// Sits where the meal list starts, the nearest thing to the deleted row's own
// place. No timer: it stays until the user leaves the day.
const DeletedMealNotice = ({ deleted }: { deleted: DeletedMeal }) => {
  if (!deleted.mealId) return null;
  return (
    <div className="mt-6 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 border-b border-border py-3 text-sm text-text-muted">
        <span>Meal deleted</span>
        <Button variant="primary" link autoFocus pending={deleted.isRestoring} aria-label="Undo deleting the meal" onClick={deleted.undo}>
          Undo
        </Button>
      </div>
      {deleted.error && <InlineMessage tone="error">{deleted.error}</InlineMessage>}
    </div>
  );
};

// A future day has nothing to log and the header offers no way forward to it,
// so a typed or stale URL lands on today instead of an empty tomorrow.
const useFutureDayRedirect = (date: string): void => {
  const router = useRouter();
  useEffect(() => {
    const today = todayLocalDateString(Intl.DateTimeFormat().resolvedOptions().timeZone);
    if (date > today) router.replace(`/day/${today}`);
  }, [date, router]);
};

// Only the kcal stat placeholder, the one piece whose size never depends on
// the day's data - a guessed macro/meal-row shape collapsed on arrival of
// real (often emptier) data, a jump-cut rather than a loading state.
const DayViewSkeleton = () => <Skeleton className="h-11 w-32" />;

interface DayViewReadyProps {
  log: DayLog;
  isToday: boolean;
  deleted: DeletedMeal;
}

const DayViewReady = ({ log, isToday, deleted }: DayViewReadyProps) => (
  <>
    <CalorieHero consumedKcal={log.dayTotal.energyKcal} initialGoal={log.calorieGoal} />
    <DayMacros total={log.dayTotal} />
    <DeletedMealNotice deleted={deleted} />
    {log.meals.length === 0 ? <DayEmptyState isToday={isToday} /> : <MealList meals={log.meals} />}
  </>
);

// Skeleton only shows past useDelayedSkeleton's fast-load threshold, so a
// quick fetch fades straight to real content instead of flashing a
// placeholder that's about to be wrong.
const DayViewBody = ({ state, deleted }: { state: DayViewState; deleted: DeletedMeal }) => {
  const reduceMotion = useReducedMotion();
  const showSkeleton = useDelayedSkeleton(state.status === "loading");

  if (state.status === "loading") {
    return showSkeleton ? <DayViewSkeleton /> : null;
  }

  return (
    <motion.div
      initial={contentFadeInitial(reduceMotion)}
      animate={{ opacity: 1 }}
      transition={contentFadeTransition(reduceMotion)}
    >
      {state.status === "error" ? (
        <InlineMessage tone="error">Could not load this day. Please try again.</InlineMessage>
      ) : (
        <DayViewReady log={state.log} isToday={state.isToday} deleted={deleted} />
      )}
    </motion.div>
  );
};

// Far enough that a scroll with some sideways drift never changes the day.
const SWIPE_MIN_DISTANCE_PX = 64;

// How far the page trails the finger. Pinned at x=0, so the slide rubber-bands
// rather than tracks 1:1: at the swipe threshold the page has moved ~26px.
const SWIPE_DRAG_ELASTIC = 0.4;

type SwipeEvent = MouseEvent | TouchEvent | PointerEvent | React.PointerEvent;

// Touch and pen only: a mouse drag is a text selection. A drag inside the goal
// sheet (its slider) belongs to the sheet, not the page behind it.
const isSwipeSource = (event: SwipeEvent): boolean =>
  !("pointerType" in event && event.pointerType === "mouse") &&
  !(event.target instanceof Element && event.target.closest("dialog"));

type SwipeProps = Pick<
  HTMLMotionProps<"main">,
  | "drag"
  | "dragControls"
  | "dragListener"
  | "dragConstraints"
  | "dragElastic"
  | "dragSnapToOrigin"
  | "dragDirectionLock"
  | "onPointerDown"
  | "onDragEnd"
  | "onPanEnd"
>;

// Swipe right for the previous day, left for the next, never past today. The
// page follows the finger and springs back short of the threshold, so a short
// swipe still shows the gesture exists; under reduced motion it stays still.
const useDaySwipe = (date: string, today: string, reduceMotion: boolean | null): SwipeProps => {
  const router = useRouter();
  const dragControls = useDragControls();
  const navigate = (event: SwipeEvent, info: PanInfo) => {
    if (!isSwipeSource(event)) return;
    const { x, y } = info.offset;
    if (Math.abs(x) < SWIPE_MIN_DISTANCE_PX || Math.abs(x) < Math.abs(y)) return;
    if (x > 0) router.push(`/day/${addCalendarDays(date, -1)}`);
    else if (date < today) router.push(`/day/${addCalendarDays(date, 1)}`);
  };
  if (reduceMotion) return { onPanEnd: navigate };
  return {
    drag: "x",
    dragControls,
    dragListener: false,
    dragConstraints: { left: 0, right: 0 },
    dragElastic: SWIPE_DRAG_ELASTIC,
    dragSnapToOrigin: true,
    dragDirectionLock: true,
    onPointerDown: (event) => {
      if (isSwipeSource(event)) dragControls.start(event);
    },
    onDragEnd: navigate,
  };
};

interface DaySlideProps {
  state: DayViewState;
  deleted: DeletedMeal;
  reduceMotion: boolean | null;
  swipe: SwipeProps;
}

// Slide timing lives in lib/motion/step-transition.ts, shared with the
// wizard. id/tabIndex are the skip link's landing target. touch-action keeps
// vertical scroll and pinch-zoom native; only the horizontal pan is handled.
const DaySlide = ({ state, deleted, reduceMotion, swipe }: DaySlideProps) => (
  <motion.main
    id="main-content"
    tabIndex={-1}
    className="flex-1 touch-pan-y touch-pinch-zoom px-4 py-6 focus:outline-none"
    {...swipe}
    initial={slideInitial(reduceMotion)}
    animate={{ opacity: 1, x: 0 }}
    transition={slideTransition(reduceMotion)}
  >
    {/* The skeleton -> content swap is silent otherwise: the error branch
        announces through InlineMessage's role="alert", the ready one had
        nothing. */}
    <LiveStatus message={state.status === "ready" ? "Day loaded" : ""} />
    <DayViewBody state={state} deleted={deleted} />
  </motion.main>
);

// Keyed on `date` so day navigation remounts DaySlide and replays its slide.
// Action bar sits outside it: stays pinned while content slides underneath.
export const DayView = ({ date, deletedMealId }: DayViewProps) => {
  useFutureDayRedirect(date);
  const [reloadCounter, setReloadCounter] = useState(0);
  const state = useDayLog(date, reloadCounter);
  const deleted = useDeletedMeal(date, deletedMealId, () => setReloadCounter((count) => count + 1));
  const reduceMotion = useReducedMotion();
  const today = todayLocalDateString(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const swipe = useDaySwipe(date, today, reduceMotion);

  return (
    <>
      <AppHeader variant="day" date={date} />
      <DaySlide key={date} state={state} deleted={deleted} reduceMotion={reduceMotion} swipe={swipe} />
      <DayActionBar date={date} today={today} />
    </>
  );
};
