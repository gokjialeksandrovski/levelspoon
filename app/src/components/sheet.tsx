"use client";

import { useEffect, useRef } from "react";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  // Rendered below the scroll area, pinned to the sheet's bottom edge.
  // For actions that must stay reachable when the body overflows a short
  // screen (the AI consent terms) - short sheets can ignore it.
  footer?: React.ReactNode;
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

// pb reserves env(safe-area-inset-bottom) the way DayActionBar already does -
// a bottom sheet is the surface most likely to sit over a phone's
// home-indicator gesture bar (found via /critique, 2026-09-10). 1.25rem
// matches p-5 so the floor is unchanged with no inset. mx-auto centers it on
// wide viewports (m-0 alone pinned it bottom-LEFT); mt-auto/mb-0 keep it a
// bottom sheet. open:flex + flex-col + max-h let the body scroll between a
// fixed title and a fixed footer - `open:` not a bare `flex`, because an
// author display value would beat the UA `dialog:not([open]){display:none}`
// and leave the closed sheet laid out, intercepting clicks (found via
// /critique, 2026-09-10).
const DIALOG_CLASS =
  "mx-auto mb-0 mt-auto max-h-[85dvh] w-full max-w-md flex-col rounded-t-(--radius-surface) border border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-text open:flex backdrop:bg-black/50";

// The scroll wrapper takes tabIndex only when a footer marks this as a
// potentially-long sheet - the body then genuinely scrolls and a keyboard
// user needs to focus it to scroll with the arrow keys (axe:
// scrollable-region-focusable). Short sheets don't scroll, so they skip the
// extra tab stop.
const SheetBody = ({ title, children, footer }: Pick<SheetProps, "title" | "children" | "footer">) => (
  <>
    <h2 className="mb-3 shrink-0 text-base font-semibold">{title}</h2>
    <div tabIndex={footer ? 0 : undefined} className="min-h-0 flex-1 overflow-y-auto">
      {children}
    </div>
    {footer && <div className="shrink-0 pt-3">{footer}</div>}
  </>
);

export const Sheet = ({ open, onClose, title, children, footer }: SheetProps) => {
  const ref = useRef<HTMLDialogElement>(null);
  useDialogSync(ref, open);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (isBackdropClick(event, ref)) onClose();
      }}
      className={DIALOG_CLASS}
    >
      <SheetBody title={title} footer={footer}>
        {children}
      </SheetBody>
    </dialog>
  );
};
