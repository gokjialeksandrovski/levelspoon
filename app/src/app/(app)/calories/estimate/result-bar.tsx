"use client";

import { useEffect, useState } from "react";

import type { IntakeReady } from "@/features/intake/actions/intake.utils";
import type { MeasuredBurn } from "@/features/intake/actions/measured-burn.utils";
import type { WeightUnit } from "@/features/weight/actions/weight.utils";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { InlineMessage } from "@/components/ui/inline-message";
import { LiveStatus } from "@/components/ui/live-status";

import {
  announcementOf,
  applyButtonText,
  CONDITION_DISCLAIMER_TEXT,
  detailLines,
  disclaimerText,
  incompleteText,
  INVALID_BAR_TEXT,
  noticeLines,
  rangeText,
  REFUSAL_TEXT,
  timelineText,
  type BarState,
} from "./intake-form.utils";

// Long enough that a typed figure is announced once, not once per keystroke
// (spec §10).
const ANNOUNCE_DELAY_MS = 800;

const useSettledText = (text: string): string => {
  const [settled, setSettled] = useState(text);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(text), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);
  return settled;
};

interface ReadyBodyProps {
  estimate: IntakeReady;
  measured: MeasuredBurn | null;
  unit: WeightUnit;
  today: string;
  hasCondition: boolean;
  isSaving: boolean;
  onUse: () => void;
}

// The range is the headline, not the point: the figure looks like an estimate
// because it is shown as one (spec direction contract).
const ReadyBody = ({ estimate, measured, unit, today, hasCondition, isSaving, onUse }: ReadyBodyProps) => {
  const timeline = timelineText(estimate, today);

  return (
    <div className="flex flex-col gap-2">
      <p className="font-display text-xl font-semibold tabular-nums">{rangeText(estimate)}</p>
      {/* Out of Details: it is the one line a goal weight changes. */}
      {timeline && <p className="text-sm text-text-muted">{timeline}</p>}
      {noticeLines(estimate).map((line) => (
        <p key={line} className="text-sm text-text-muted">
          {line}
        </p>
      ))}
      <Button variant="primary" className="w-full" pending={isSaving} onClick={onUse}>
        {applyButtonText(estimate)}
      </Button>
      <p className="text-xs text-text-muted">{disclaimerText(estimate)}</p>
      {hasCondition && <p className="text-xs text-text-muted">{CONDITION_DISCLAIMER_TEXT}</p>}
      <Disclosure label="Details">
        <div className="flex flex-col gap-1 pt-1 text-xs tabular-nums text-text-muted">
          {detailLines(estimate, unit, measured).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </Disclosure>
    </div>
  );
};

interface ResultBarProps {
  state: BarState;
  measured: MeasuredBurn | null;
  unit: WeightUnit;
  today: string;
  hasCondition: boolean;
  isSaving: boolean;
  hasError: boolean;
  onUse: () => void;
}

const BarBody = ({ state, ...ready }: Omit<ResultBarProps, "hasError">) => {
  switch (state.kind) {
    case "incomplete":
      return <p className="text-sm text-text-muted">{incompleteText(state.missing)}</p>;
    case "invalid":
      return <p className="text-sm text-text-muted">{INVALID_BAR_TEXT}</p>;
    case "refused":
      return <p className="text-sm text-text">{REFUSAL_TEXT[state.reason]}</p>;
    case "ready":
      return <ReadyBody estimate={state.estimate} {...ready} />;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
};

// Sticky inside the page, not an overlay: the form scrolls under it and the
// one commit stays in thumb reach (PRODUCT.md principle 5). No modal, no Sheet.
export const ResultBar = ({ hasError, ...body }: ResultBarProps) => {
  const announcement = useSettledText(announcementOf(body.state));

  return (
    <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-border bg-bg px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {hasError && <InlineMessage tone="error">Could not save. Please try again.</InlineMessage>}
      <BarBody {...body} />
      <LiveStatus message={announcement} />
    </div>
  );
};
