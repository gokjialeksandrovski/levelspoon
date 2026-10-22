"use client";

import { CaretDownIcon, XIcon } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useId, useState } from "react";

import { deleteWeightGoal, logWeight } from "@/features/weight/actions/weight";
import {
  checkinCountdown,
  commitWeightDraft,
  displayWeight,
  isCheckinDue,
  isUnusableWeightDraft,
  weightProgress,
  type WeightGoal,
  type WeightProgress,
  type WeightUnit,
  type WeightView,
} from "@/features/weight/actions/weight.utils";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";
import { SettleNumber } from "@/components/ui/settle-number";
import { FOCUS_RING, ICON_ROW_EDGE_PULL_RIGHT, ICON_TAP_TARGET_CLASS } from "@/components/ui/tap-target";

import { WeightGoalSheet } from "./weight-goal-sheet";
import { dismissWeighIn, isWeighInDismissed } from "./weigh-in-dismissal";
import { WeightRail } from "./weight-rail";
import { lastChangeText, nextCheckinLineText, progressLineText, projectionLineText } from "./weight-row.utils";

const CHEVRON_ROTATE_DURATION_SECONDS = 0.26;
const CHEVRON_OPEN_ROTATE_DEGREES = 180;
const CHEVRON_CLOSED_ROTATE_DEGREES = 0;
const CHEVRON_ICON_SIZE = 14;

const currentTimezone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

// One muted line, no rail: discoverable without nagging, and with nothing
// stored there is nothing to dismiss.
const UnsetRow = ({ onOpen }: { onOpen: () => void }) => (
  <button type="button" onClick={onOpen} className={`-my-2 mt-2 flex w-full items-center gap-1 py-2 text-left text-sm text-text-muted ${FOCUS_RING}`}>
    Track a weight goal
    <CaretDownIcon size={CHEVRON_ICON_SIZE} weight="bold" className="-rotate-90" />
  </button>
);

interface WeighInPromptProps {
  isSaving: boolean;
  hasError: boolean;
  unit: WeightUnit;
  placeholder: string;
  onLog: (draft: string) => void;
  onDismiss: () => void;
}

// Empty, never pre-filled with the last reading: a pre-filled value turns "tap
// Log" into recording a stale number as today's reading. The placeholder is a
// format hint only.
//
// ✕ leaves the prompt with no request and without marking the check-in done -
// the exit every entered state owes (global Rule 21).
const WeighInPrompt = ({ isSaving, hasError, unit, placeholder, onLog, onDismiss }: WeighInPromptProps) => {
  const [draft, setDraft] = useState("");
  const fieldId = useId();

  return (
    <div className="mt-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={fieldId} className="text-sm text-text-muted">
          Weigh-in due today
        </label>
        <button
          type="button"
          onClick={onDismiss}
          disabled={isSaving}
          aria-label="Not now"
          className={`${ICON_TAP_TARGET_CLASS} ${ICON_ROW_EDGE_PULL_RIGHT} -my-3 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent`}
        >
          <XIcon weight="regular" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        {/* Raw input, deliberately: Field stacks a label above a full-width box,
            and this is one inline figure beside its button. The label above is
            the field's own, wired by htmlFor. */}
        <input
          id={fieldId}
          type="text"
          inputMode="decimal"
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            onLog(draft);
          }}
          className="w-24 rounded-control border border-text-muted bg-surface px-3 py-2 text-center text-sm tabular-nums text-text placeholder:text-text-muted focus-visible:border-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-text"
        />
        <span className="text-sm text-text-muted">{unit}</span>
        <Button variant="primary" pending={isSaving} onClick={() => onLog(draft)}>
          Log
        </Button>
      </div>
      {isUnusableWeightDraft(draft, unit) && draft.trim() !== "" && (
        <InlineMessage tone="info">That was not a weight we could read, so nothing changed.</InlineMessage>
      )}
      {hasError && <InlineMessage tone="error">Could not save that reading. Please try again.</InlineMessage>}
    </div>
  );
};

interface PanelActionsProps {
  isDeleting: boolean;
  isArmed: boolean;
  onLogRequest: () => void;
  onEdit: () => void;
  onArm: () => void;
  onDisarm: () => void;
  onDelete: () => void;
}

// Delete is two taps and the first one is reversible: the resting control is
// as quiet as its neighbours, and `danger` only appears once the action is
// armed - the block's one coloured control, and only while it is live.
// Cancel is the non-committal exit (global Rule 21); arming fires no request.
const PanelActions = ({ isDeleting, isArmed, onLogRequest, onEdit, onArm, onDisarm, onDelete }: PanelActionsProps) => {
  if (isArmed) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <span>Delete this goal? Your readings stay.</span>
        <Button variant="danger" link pending={isDeleting} onClick={onDelete}>
          Delete
        </Button>
        <Button variant="ghost" link disabled={isDeleting} onClick={onDisarm}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-1 flex gap-3">
      <Button variant="primary" link onClick={onLogRequest}>
        Log weight
      </Button>
      <Button variant="ghost" link onClick={onEdit}>
        Edit goal
      </Button>
      <Button variant="ghost" link onClick={onArm}>
        Delete goal
      </Button>
    </div>
  );
};

interface WeightPanelProps {
  view: WeightView;
  panelId: string;
  expanded: boolean;
  today: string;
  deletion: DeleteState;
  onEdit: () => void;
  onLogRequest: () => void;
}

// Every line is a stored fact or arithmetic over stored facts. Nothing judges
// the pace, and no line converts a rate into calories.
const WeightPanel = ({ view, panelId, expanded, today, deletion, onEdit, onLogRequest }: WeightPanelProps) => {
  const countdown = checkinCountdown(view.nextCheckinDate, new Date(), currentTimezone());
  const projection = view.latest ? projectionLineText(view.goal, view.latest.weightKg, today, view.unit) : null;

  return (
    <div id={panelId} className={`mt-2 flex flex-col gap-1 text-sm text-text-muted ${expanded ? "" : "hidden"}`}>
      {view.latest && <p>{lastChangeText(view.latest, view.previous, view.goal, view.unit)}</p>}
      {projection && <p>{projection}</p>}
      {countdown.kind !== "due" && <p>{nextCheckinLineText(view.nextCheckinDate, countdown, view.goal, view.unit)}</p>}
      <PanelActions
        isDeleting={deletion.isDeleting}
        isArmed={deletion.isArmed}
        onLogRequest={onLogRequest}
        onEdit={onEdit}
        onArm={deletion.arm}
        onDisarm={deletion.disarm}
        onDelete={deletion.remove}
      />
      {deletion.hasError && <InlineMessage tone="error">Could not delete that goal. Please try again.</InlineMessage>}
    </div>
  );
};

interface ProgressLineProps {
  progress: WeightProgress;
  goal: WeightGoal;
  unit: WeightUnit;
  panelId: string;
  expanded: boolean;
  onToggle: () => void;
}

// -my-2/py-2 reaches the 44px tap floor without growing the row, the same
// trick MacroToggle uses.
const ProgressLine = ({ progress, goal, unit, panelId, expanded, onToggle }: ProgressLineProps) => {
  const reduceMotion = useReducedMotion();

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={panelId}
      aria-label="Weight goal"
      className={`-my-2 -mx-1 flex w-full items-center justify-between gap-2 rounded-control px-1 py-2 text-left text-sm text-text-muted transition-colors hover:bg-surface-raised active:bg-surface-raised ${FOCUS_RING}`}
    >
      <span className="truncate tabular-nums">
        <SettleNumber value={progressLineText(progress, goal, unit)} reduceMotion={reduceMotion} />
      </span>
      <motion.span
        animate={{ rotate: expanded ? CHEVRON_OPEN_ROTATE_DEGREES : CHEVRON_CLOSED_ROTATE_DEGREES }}
        transition={{ duration: reduceMotion ? 0 : CHEVRON_ROTATE_DURATION_SECONDS }}
        className="inline-flex shrink-0 self-center text-text"
      >
        <CaretDownIcon size={CHEVRON_ICON_SIZE} weight="bold" />
      </motion.span>
    </button>
  );
};

interface LogState {
  isSaving: boolean;
  hasError: boolean;
  log: (draft: string) => void;
}

const useLogWeight = (currentKg: number, unit: WeightUnit, onLogged: (view: WeightView) => void): LogState => {
  const [isSaving, setIsSaving] = useState(false);
  const [hasError, setHasError] = useState(false);

  const log = (draft: string): void => {
    if (isUnusableWeightDraft(draft, unit)) return;
    setIsSaving(true);
    setHasError(false);
    // The reading crosses in kg whatever the user typed: the column is kg and
    // the unit is a display preference, never a storage one.
    logWeight(commitWeightDraft(draft, unit, currentKg), currentTimezone())
      .then((result) => {
        if (result.kind === "logged") onLogged(result.view);
        else setHasError(true);
      })
      .catch(() => setHasError(true))
      .finally(() => setIsSaving(false));
  };

  return { isSaving, hasError, log };
};

interface DeleteState {
  isArmed: boolean;
  isDeleting: boolean;
  hasError: boolean;
  arm: () => void;
  disarm: () => void;
  remove: () => void;
}

const useDeleteGoal = (onDeleted: () => void): DeleteState => {
  const [isArmed, setIsArmed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hasError, setHasError] = useState(false);

  const remove = (): void => {
    setIsDeleting(true);
    setHasError(false);
    deleteWeightGoal()
      .then(onDeleted)
      .catch(() => setHasError(true))
      .finally(() => setIsDeleting(false));
  };

  return {
    isArmed,
    isDeleting,
    hasError,
    arm: () => setIsArmed(true),
    // Arming wrote nothing, so leaving it costs nothing to undo.
    disarm: () => {
      setIsArmed(false);
      setHasError(false);
    },
    remove,
  };
};

interface WeighInPromptState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  dismiss: () => void;
}

// Dismissal is read here rather than in an effect: isWeighInDismissed only
// touches localStorage, and a miss returns false, so there is no state to
// hydrate and no flash to avoid.
const useWeighInPrompt = (today: string, nextCheckinDate: string | null): WeighInPromptState => {
  const [isOpenByRequest, setIsOpenByRequest] = useState(false);
  const [dismissedDate, setDismissedDate] = useState<string | null>(null);

  const isDismissed = dismissedDate === today || (dismissedDate === null && isWeighInDismissed(today));
  const isDue = nextCheckinDate !== null && isCheckinDue(nextCheckinDate, today);

  return {
    isOpen: isOpenByRequest || (isDue && !isDismissed),
    open: () => setIsOpenByRequest(true),
    close: () => setIsOpenByRequest(false),
    // The exit every entered state owes: no request, and the check-in stays
    // unanswered so the prompt returns tomorrow. A daily cadence therefore
    // asks again tomorrow, which is the cadence the user chose - the app does
    // not decide they stopped meaning it.
    dismiss: () => {
      dismissWeighIn(today);
      setDismissedDate(today);
      setIsOpenByRequest(false);
    },
  };
};

// Pulled out of WeightRow so its optional chains do not count against the
// component's own branching - the row reads as orchestration, not as five
// nullable lookups.
const viewUnit = (view: WeightView | null): WeightUnit => view?.unit ?? "kg";
const latestWeightKg = (view: WeightView | null): number => view?.latest?.weightKg ?? 0;
const nextCheckin = (view: WeightView | null): string | null => view?.nextCheckinDate ?? null;

interface WeightRowProps {
  initialView: WeightView | null;
  today: string;
}

// Owns the view locally, seeded from the server-fetched value, so a log or a
// goal edit updates the row without a day refetch - the same pattern
// CalorieHero uses for the calorie goal.
export const WeightRow = ({ initialView, today }: WeightRowProps) => {
  const [view, setView] = useState(initialView);
  const [expanded, setExpanded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetToken, setSheetToken] = useState(0);
  const panelId = useId();
  const prompt = useWeighInPrompt(today, nextCheckin(view));
  const deletion = useDeleteGoal(() => {
    setView(null);
    setExpanded(false);
  });

  const openSheet = (): void => {
    setSheetToken((token) => token + 1);
    setSheetOpen(true);
  };

  const onLogged = (next: WeightView): void => {
    setView(next);
    prompt.close();
  };
  const unit = viewUnit(view);
  const logState = useLogWeight(latestWeightKg(view), unit, onLogged);

  if (view === null) {
    return (
      <div className="mt-4">
        <UnsetRow onOpen={openSheet} />
        <WeightGoalSheet key={sheetToken} open={sheetOpen} view={null} onClose={() => setSheetOpen(false)} onSaved={setView} />
      </div>
    );
  }

  const progress = weightProgress(view.goal, view.latest);

  return (
    <div className="mt-4">
      {prompt.isOpen ? (
        <WeighInPrompt
          isSaving={logState.isSaving}
          hasError={logState.hasError}
          unit={unit}
          placeholder={view.latest ? String(displayWeight(view.latest.weightKg, unit)) : ""}
          onLog={logState.log}
          onDismiss={prompt.dismiss}
        />
      ) : (
        <>
          <ProgressLine progress={progress} goal={view.goal} unit={unit} panelId={panelId} expanded={expanded} onToggle={() => setExpanded((open) => !open)} />
          <WeightRail railShare={progress.railShare} fillShare={progress.fillShare} />
          <WeightPanel
            view={view}
            panelId={panelId}
            expanded={expanded}
            today={today}
            deletion={deletion}
            onEdit={openSheet}
            onLogRequest={prompt.open}
          />
        </>
      )}
      <WeightGoalSheet key={sheetToken} open={sheetOpen} view={view} onClose={() => setSheetOpen(false)} onSaved={setView} />
    </div>
  );
};
