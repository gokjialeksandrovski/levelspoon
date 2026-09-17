"use client";

import { useEffect, useId, useRef } from "react";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  // Pinned below the scroll area for actions that must stay reachable when
  // the body overflows a short screen (e.g. AI consent terms).
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

// pb reserves safe-area-inset-bottom (bottom sheets sit over the home
// indicator); 1.25rem matches p-5 so the floor is unchanged with no inset.
// mx-auto centers on wide viewports - m-0 alone pins it bottom-LEFT.
// Entrance is CSS @starting-style (motion/react is reserved for press and
// log-success); close stays instant so dismissing never waits on a slide.
// open:flex (not bare flex) is required: a bare `flex` would beat the UA's
// `dialog:not([open]){display:none}` and leave the closed sheet clickable.
const DIALOG_CLASS =
  "mx-auto mb-0 mt-auto max-h-[85dvh] w-full max-w-md flex-col rounded-t-(--radius-surface) border border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-text transition-transform duration-(--duration-step) ease-out-quart open:flex starting:open:translate-y-full backdrop:bg-scrim backdrop:transition-opacity backdrop:duration-(--duration-step) starting:open:backdrop:opacity-0";

// tabIndex only when a footer marks this as scrollable, so keyboard users
// can focus the body to scroll it (axe: scrollable-region-focusable).
const SheetBody = ({ titleId, title, children, footer }: Pick<SheetProps, "title" | "children" | "footer"> & { titleId: string }) => (
  <>
    <h2 id={titleId} className="mb-3 shrink-0 text-lg font-semibold">
      {title}
    </h2>
    {/* -mx-1 px-1: overflow-y-auto also clips horizontally, which shaves the
        sides off any offset focus outline inside. The gutter gives them room
        without moving the content. */}
    <div tabIndex={footer ? 0 : undefined} className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
      {children}
    </div>
    {footer && <div className="shrink-0 pt-3">{footer}</div>}
  </>
);

export const Sheet = ({ open, onClose, title, children, footer }: SheetProps) => {
  const ref = useRef<HTMLDialogElement>(null);
  // showModal() gives the element role="dialog"; without this the title is
  // just text inside it and the dialog announces with no name (WCAG 4.1.2).
  const titleId = useId();
  useDialogSync(ref, open);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (isBackdropClick(event, ref)) onClose();
      }}
      className={DIALOG_CLASS}
    >
      <SheetBody titleId={titleId} title={title} footer={footer}>
        {children}
      </SheetBody>
    </dialog>
  );
};
