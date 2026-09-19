"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useId, useState } from "react";

import { Button } from "./button";

interface DisclosureProps {
  label: string;
  children: React.ReactNode;
}

// Chevron rotation is motion/react (JS-driven), so it needs its own
// reduced-motion check; the grid-template-rows reveal below is a plain CSS
// transition and already collapses via globals.css's global media-query
// override. Duration matches --duration-step - the app's one shared recipe.
const CHEVRON_ROTATE_DURATION_SECONDS = 0.26;
const CHEVRON_OPEN_ROTATE_DEGREES = 180;
const CHEVRON_CLOSED_ROTATE_DEGREES = 0;
const CHEVRON_ICON_SIZE = 14;

interface DisclosureTriggerProps {
  label: string;
  isOpen: boolean;
  contentId: string;
  reduceMotion: boolean | null;
  onToggle: () => void;
}

const DisclosureTrigger = ({ label, isOpen, contentId, reduceMotion, onToggle }: DisclosureTriggerProps) => (
  <Button variant="ghost" link aria-expanded={isOpen} aria-controls={contentId} onClick={onToggle}>
    <span className="inline-flex items-center gap-1">
      {label}
      <motion.span
        animate={{ rotate: isOpen ? CHEVRON_OPEN_ROTATE_DEGREES : CHEVRON_CLOSED_ROTATE_DEGREES }}
        transition={{ duration: reduceMotion ? 0 : CHEVRON_ROTATE_DURATION_SECONDS }}
        className="inline-flex"
      >
        <CaretDownIcon size={CHEVRON_ICON_SIZE} />
      </motion.span>
    </span>
  </Button>
);

// grid-template-rows (0fr -> 1fr), not height directly, per the app's motion
// rule against animating layout properties - see .impeccable.md Motion Rules.
const DisclosurePanel = ({ contentId, isOpen, children }: { contentId: string; isOpen: boolean; children: React.ReactNode }) => (
  <div
    id={contentId}
    className={`grid transition-[grid-template-rows] duration-(--duration-step) ease-out-quart ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
  >
    {/* -mx-1/px-1: the clip edge has to sit outside the content, or it cuts the
        left and right of a focus ring on anything inside the panel. Vertical
        clipping is what makes the 0fr collapse work, so only x moves. */}
    <div className="-mx-1 overflow-hidden px-1">{children}</div>
  </div>
);

export const Disclosure = ({ label, children }: DisclosureProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const contentId = useId();

  return (
    <div>
      <DisclosureTrigger
        label={label}
        isOpen={isOpen}
        contentId={contentId}
        reduceMotion={reduceMotion}
        onToggle={() => setIsOpen((open) => !open)}
      />
      <DisclosurePanel contentId={contentId} isOpen={isOpen}>
        {children}
      </DisclosurePanel>
    </div>
  );
};
