"use client";

import { XIcon } from "@phosphor-icons/react";
import { useDragControls, useReducedMotion, type HTMLMotionProps, type PanInfo } from "motion/react";
import * as motion from "motion/react-m";
import { useRouter } from "next/navigation";
import { Suspense, use, useEffect, useState } from "react";

import { restoreMeal } from "@/features/meals/actions/meals";
import type { DayLog } from "@/features/meals/actions/meals";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import { DelayedFallback } from "@/components/ui/delayed-fallback";
import { InlineMessage } from "@/components/ui/inline-message";
import { LiveStatus } from "@/components/ui/live-status";
import { Skeleton } from "@/components/ui/skeleton";
import { ICON_ROW_EDGE_PULL_RIGHT, ICON_TAP_TARGET_CLASS } from "@/components/ui/tap-target";
import { addCalendarDays } from "@/lib/date/day-bounds";
import { contentFadeInitial, contentFadeTransition, slideInitial, slideTransition } from "@/lib/motion/step-transition";

import { CalorieHero } from "./calorie-hero";
import { DayActionBar } from "./day-action-bar";
import { DayEmptyState } from "./day-empty-state";
import { MealList } from "./meal-list";
import { WeightRow } from "./weight-row";

// Read on the server and handed down unresolved, so the page shell paints at
// once and the day streams in. A failed read resolves to "error" rather than
// rejecting: the view keeps its header and action bar and says so inline.
export type DayLoad = { status: "ready"; log: DayLog } | { status: "error" };

interface DayViewProps {
  date: string;
  today: string;
  deletedMealId: string | null;
  load: Promise<DayLoad>;
}

interface DeletedMeal {
  mealId: string | null;
  isRestoring: boolean;
  error: string | null;
  undo: () => void;
  dismiss: () => void;
}

// The id is copied into state and the ?deleted= param dropped from the URL at
// once, so a reload or a shared link never offers Undo for a stale delete.
const useDeletedMeal = (date: string, deletedMealId: string | null): DeletedMeal => {
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
    // restoreMeal refreshes the route itself, so the meal reappears with it.
    restoreMeal(mealId)
      .then(() => setMealId(null))
      .catch(() => setError("Couldn't bring the meal back. Try again."))
      .finally(() => setIsRestoring(false));
  };

  // Local only: the meal stays soft-deleted and createMeal's purge clears it.
  // Focus goes to the skip-link target, not <body>, with the unmounted button.
  const dismiss = () => {
    setMealId(null);
    document.getElementById("main-content")?.focus();
  };

  return { mealId, isRestoring, error, undo, dismiss };
};

// Sits where the meal list starts, the nearest thing to the deleted row's own
// place. No timer, so it stays until the user leaves the day or dismisses it.
const DeletedMealNotice = ({ deleted }: { deleted: DeletedMeal }) => {
  if (!deleted.mealId) return null;
  return (
    <div className="mt-6 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 border-b border-border py-3 text-sm text-text-muted">
        <span>Meal deleted</span>
        <div className="flex items-center gap-1">
          <Button variant="primary" link autoFocus pending={deleted.isRestoring} aria-label="Undo deleting the meal" onClick={deleted.undo}>
            Undo
          </Button>
          {/* Disabled mid-restore so a failed restore's error can't vanish with the row. -my-3 keeps the 44px box from growing the row. */}
          <button
            type="button"
            onClick={deleted.dismiss}
            disabled={deleted.isRestoring}
            aria-label="Dismiss"
            className={`${ICON_TAP_TARGET_CLASS} ${ICON_ROW_EDGE_PULL_RIGHT} -my-3 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent`}
          >
            <XIcon weight="regular" />
          </button>
        </div>
      </div>
      {deleted.error && <InlineMessage tone="error">{deleted.error}</InlineMessage>}
    </div>
  );
};

// Only the kcal stat placeholder, the one piece whose size never depends on
// the day's data - a guessed macro/meal-row shape collapsed on arrival of
// real (often emptier) data, a jump-cut rather than a loading state.
const DayViewSkeleton = () => <Skeleton className="h-11 w-32" />;

interface DayViewReadyProps {
  log: DayLog;
  isToday: boolean;
  today: string;
  deleted: DeletedMeal;
}

const DayViewReady = ({ log, isToday, today, deleted }: DayViewReadyProps) => (
  <>
    <CalorieHero total={log.dayTotal} fibreCoverage={log.dayFibreCoverage} initialGoal={log.calorieGoal} initialTargets={log.macroTargets} />
    {/* Today only, and outside DayMacros' zero-macro early return: a weight
        goal is about weeks and does not disappear on a day with no meals. */}
    {isToday && <WeightRow initialView={log.weight} today={today} />}
    <DeletedMealNotice deleted={deleted} />
    {log.meals.length === 0 ? <DayEmptyState isToday={isToday} /> : <MealList meals={log.meals} />}
  </>
);

interface DayContentProps {
  load: Promise<DayLoad>;
  isToday: boolean;
  today: string;
  deleted: DeletedMeal;
  onLoaded: (isLoaded: boolean) => void;
}

// Fades in once, on first reveal. A refresh after a write hands down a new
// promise, but inside a transition, so the day on screen stays until the
// new one is ready and nothing remounts.
const DayContent = ({ load, isToday, today, deleted, onLoaded }: DayContentProps) => {
  const result = use(load);
  const reduceMotion = useReducedMotion();
  const isReady = result.status === "ready";
  useEffect(() => onLoaded(isReady), [isReady, onLoaded]);

  return (
    <motion.div
      initial={contentFadeInitial(reduceMotion)}
      animate={{ opacity: 1 }}
      transition={contentFadeTransition(reduceMotion)}
    >
      {result.status === "error" ? (
        <InlineMessage tone="error">Could not load this day. Please try again.</InlineMessage>
      ) : (
        <DayViewReady log={result.log} isToday={isToday} today={today} deleted={deleted} />
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
  load: Promise<DayLoad>;
  isToday: boolean;
  today: string;
  deleted: DeletedMeal;
  reduceMotion: boolean | null;
  swipe: SwipeProps;
}

// Slide timing lives in lib/motion/step-transition.ts, shared with the
// wizard. id/tabIndex are the skip link's landing target. touch-action keeps
// vertical scroll and pinch-zoom native; only the horizontal pan is handled.
// LiveStatus sits outside the Suspense boundary: a live region has to exist
// before its text changes, and the content mounts only once the day is read.
const DaySlide = ({ load, isToday, today, deleted, reduceMotion, swipe }: DaySlideProps) => {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
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
      <LiveStatus message={isLoaded ? "Day loaded" : ""} />
      <Suspense fallback={<DelayedFallback><DayViewSkeleton /></DelayedFallback>}>
        <DayContent load={load} isToday={isToday} today={today} deleted={deleted} onLoaded={setIsLoaded} />
      </Suspense>
    </motion.main>
  );
};

// Keyed on `date` so day navigation remounts DaySlide and replays its slide.
// Action bar sits outside it: stays pinned while content slides underneath.
export const DayView = ({ date, today, deletedMealId, load }: DayViewProps) => {
  const deleted = useDeletedMeal(date, deletedMealId);
  const reduceMotion = useReducedMotion();
  const swipe = useDaySwipe(date, today, reduceMotion);

  return (
    <>
      <AppHeader variant="day" date={date} today={today} />
      <DaySlide key={date} load={load} isToday={date === today} today={today} deleted={deleted} reduceMotion={reduceMotion} swipe={swipe} />
      <DayActionBar date={date} today={today} />
    </>
  );
};
