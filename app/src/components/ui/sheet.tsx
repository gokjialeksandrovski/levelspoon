"use client";

import { XIcon } from "@phosphor-icons/react";
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
// Both directions are CSS (motion/react is reserved for press and
// log-success): the resting state is translated down and transparent, [open]
// is the settled state, and @starting-style supplies the entrance's first
// frame. The exit needs transition-discrete on `display` and `overlay` too -
// close() drops the open attribute, and without allow-discrete the UA's
// `display: none` and the top-layer exit both land on frame one, which is
// what made dismissing instant no matter what transform was declared.
// open:flex (not bare flex) is required: a bare `flex` would beat the UA's
// `dialog:not([open]){display:none}` and leave the closed sheet clickable.
const DIALOG_CLASS =
  "mx-auto mb-0 mt-auto max-h-[85dvh] w-full max-w-md translate-y-full flex-col rounded-t-(--radius-surface) border border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-text transition-[transform,display,overlay] transition-discrete duration-(--duration-step) ease-out-quart open:flex open:translate-y-0 starting:open:translate-y-full backdrop:bg-scrim backdrop:opacity-0 backdrop:transition-opacity backdrop:duration-(--duration-step) open:backdrop:opacity-100 starting:open:backdrop:opacity-0";

// 16px in a 32px disc: the icon set's default weight is a hairline, which read
// as a stray glyph beside an 18px semibold heading rather than as a control.
const CLOSE_ICON_SIZE = 16;

// tabIndex only when a footer marks this as scrollable, so keyboard users
// can focus the body to scroll it (axe: scrollable-region-focusable).
// The close control is the sheet's visible exit (CLAUDE.md rule 21): Escape
// and a backdrop tap already dismiss, but a phone has no Escape key and a
// backdrop tap is only discoverable if you already know it, which left the
// committing action as the one exit a user could see.
const SheetBody = ({ titleId, title, children, footer, onClose }: Pick<SheetProps, "title" | "children" | "footer" | "onClose"> & { titleId: string }) => (
  <>
    <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
      <h2 id={titleId} className="text-lg font-semibold">
        {title}
      </h2>
      {/* Same shape as the day view's goal pill: a surface-raised disc for the
          eye, an invisible p-1.5 collar taking the hit box to 44px, and the
          ring drawn on the disc rather than the collar. A bare 44px icon box
          would put a hairline X in empty space at the exact corner where the
          sheet's rounded edge is already busy. */}
      <button type="button" onClick={onClose} aria-label="Close" className="group -m-1.5 shrink-0 p-1.5 focus-visible:outline-none">
        <span className="flex size-8 items-center justify-center rounded-full bg-surface-raised text-text-muted transition-colors group-hover:bg-border group-hover:text-text group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-text">
          <XIcon size={CLOSE_ICON_SIZE} weight="bold" />
        </span>
      </button>
    </div>
    {/* -m-1 p-1: overflow-y-auto clips on every side, which shaved the top
        edge off a first-row control's offset focus outline (2px + 2px offset).
        The gutter gives it room without moving the content.
        No scrollbar at all: even thin, it drew a chrome seam down the inside
        edge of a rounded sheet. Touch, wheel and the focusable body still
        scroll it. */}
    <div
      tabIndex={footer ? 0 : undefined}
      className="-m-1 min-h-0 flex-1 overflow-y-auto p-1 scrollbar-none [&::-webkit-scrollbar]:hidden"
    >
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
      <SheetBody titleId={titleId} title={title} footer={footer} onClose={onClose}>
        {children}
      </SheetBody>
    </dialog>
  );
};
