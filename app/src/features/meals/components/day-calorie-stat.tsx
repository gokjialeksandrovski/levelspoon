"use client";

import type { CalorieRemaining, CalorieRemainingStatus } from "@/features/goals/actions/goals.utils";
import { SettleNumber } from "@/components/ui/settle-number";
import { Stat, type StatTone } from "@/components/ui/stat";

const HERO_UNIT: Record<CalorieRemainingStatus, string> = {
  unset: "kcal consumed",
  left: "kcal left",
  over: "kcal over",
};

const HERO_TONE: Record<CalorieRemainingStatus, StatTone> = {
  unset: "default",
  left: "default",
  over: "danger",
};

const heroValue = (remaining: CalorieRemaining, consumedKcal: number): number =>
  remaining.status === "unset" ? Math.round(consumedKcal) : remaining.kcal;

interface DayCalorieStatProps {
  consumedKcal: number;
  remaining: CalorieRemaining;
  reduceMotion: boolean | null;
}

// The day's headline figure, shared by the day view and the capture wizard's
// saved step, so a save lands on the same number the user checks every day.
export const DayCalorieStat = ({ consumedKcal, remaining, reduceMotion }: DayCalorieStatProps) => (
  <Stat
    value={<SettleNumber value={heroValue(remaining, consumedKcal).toLocaleString()} reduceMotion={reduceMotion} />}
    unit={HERO_UNIT[remaining.status]}
    tone={HERO_TONE[remaining.status]}
  />
);
