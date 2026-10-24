import { useSession } from "next-auth/react";
import { useCallback, useMemo, useSyncExternalStore } from "react";

import { MAX_PASTE_ITEMS } from "@/features/meals/actions/meals.utils";

import { copiedStorageKey, parseCopied, type CopiedIngredient } from "./copied-ingredients.utils";

/** "full": the list would pass what one paste may send, so nothing was written. */
export type CopyWrite = "written" | "full";

export interface CopiedIngredientsStore {
  items: readonly CopiedIngredient[];
  replace: (next: readonly CopiedIngredient[]) => CopyWrite;
}

const listeners = new Set<() => void>();

// Same-tab writes notify through `listeners`; the storage event only fires in
// other tabs, which is how a copy made there shows here.
const subscribe = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
};

const readRaw = (key: string | null): string | null => {
  if (key === null) {
    return null;
  }
  try {
    return localStorage.getItem(key);
  } catch {
    // Private mode / storage disabled: nothing copied.
    return null;
  }
};

const writeRaw = (key: string, next: readonly CopiedIngredient[]): void => {
  try {
    if (next.length === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(next));
    }
  } catch {
    // Storage blocked or full: the list has nowhere to live, so it stays as it was.
  }
  listeners.forEach((onChange) => onChange());
};

const getServerSnapshot = (): string | null => null;

export const useCopiedIngredients = (): CopiedIngredientsStore => {
  const key = copiedStorageKey(useSession().data?.user?.id);
  // The snapshot is the raw string, parsed below: a parsed array is a new
  // reference on every call, which useSyncExternalStore reads as a change and
  // re-renders forever. A string compares by value.
  const raw = useSyncExternalStore(subscribe, () => readRaw(key), getServerSnapshot);
  const items = useMemo(() => parseCopied(raw), [raw]);
  // Capped here, the one write path, so every way of copying stops at the
  // limit up front instead of the whole list failing later at Paste.
  const replace = useCallback(
    (next: readonly CopiedIngredient[]): CopyWrite => {
      if (next.length > MAX_PASTE_ITEMS) {
        return "full";
      }
      if (key !== null) {
        writeRaw(key, next);
      }
      return "written";
    },
    [key],
  );
  return { items, replace };
};
