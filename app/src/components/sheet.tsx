"use client";

import { useEffect, useRef } from "react";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const isBackdropClick = (
  event: React.MouseEvent<HTMLDialogElement>,
  ref: React.RefObject<HTMLDialogElement | null>,
): boolean => event.target === ref.current;

const useDialogSync = (ref: React.RefObject<HTMLDialogElement | null>, open: boolean): void => {
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [ref, open]);
};

export const Sheet = ({ open, onClose, title, children }: SheetProps) => {
  const ref = useRef<HTMLDialogElement>(null);
  useDialogSync(ref, open);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (isBackdropClick(event, ref)) onClose();
      }}
      // pb reserves env(safe-area-inset-bottom) the way DayActionBar already
      // does - a bottom sheet is the one surface most likely to sit over a
      // phone's home-indicator gesture bar, and it previously had no safe-area
      // padding at all (found via /critique, 2026-09-10). 1.25rem matches p-5's
      // own value so the floor is unchanged on devices with no inset.
      // mx-auto centers it on wide viewports (m-0 alone pinned it to the
      // bottom-LEFT corner); mt-auto/mb-0 keep it a bottom sheet. max-h +
      // overflow-y keep a long sheet (the AI consent terms) inside the
      // viewport and scrollable instead of overflowing off-screen.
      className="mx-auto mb-0 mt-auto max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-(--radius-surface) border border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-text backdrop:bg-black/50"
    >
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {children}
    </dialog>
  );
};
