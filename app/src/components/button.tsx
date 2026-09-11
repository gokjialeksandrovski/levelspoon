"use client";

import { motion } from "motion/react";

export type ButtonVariant = "primary" | "ghost" | "danger" | "fat";

// Native onDrag*/onAnimation* handlers are omitted: motion.button redefines
// them with its own signatures, incompatible with React's native DOM event
// handler types. No call site passes these props.
type NativeButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  | "onDrag"
  | "onDragStart"
  | "onDragEnd"
  | "onAnimationStart"
  | "onAnimationEnd"
  | "onAnimationIteration"
>;

interface ButtonProps extends NativeButtonProps {
  variant?: ButtonVariant;
  // An async action is in flight: the button both disables (so the action
  // can't be fired twice) and sets aria-busy, so a screen reader announces
  // "busy" rather than leaving the user unsure whether their tap registered
  // - the disabled dimming alone reads the same as a form that isn't ready
  // yet (found via /accessibility, 2026-09-10).
  pending?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-text text-bg hover:brightness-90",
  ghost: "bg-surface-raised text-text hover:bg-border",
  danger: "border border-danger text-danger hover:bg-danger/10",
  fat: "border border-accent-fat text-accent-fat hover:bg-accent-fat/10",
};

// Exported so a non-<button> element that must look like a Button (e.g. a
// next/link styled as a call-to-action) can share this exact class recipe
// instead of duplicating it - see meal-detail.tsx.
//
// py-3 (not py-2.5): 10px sat off the app's 4pt spacing scale, and text-sm's
// 20px line-height + 2*12px padding lands exactly on the 44px touch-target
// floor as a side effect (found via /critique, 2026-09-09).
export const buttonClassName = (variant: ButtonVariant = "primary", className = ""): string =>
  `rounded-(--radius-control) px-4 py-3 text-sm font-medium transition-transform duration-100 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${VARIANT[variant]} ${className}`;

// Press-feedback spring (spec §2.5). Plain JS constants: motion/react's
// spring config needs numbers, not CSS custom properties.
const PRESS_SPRING_STIFFNESS = 400;
const PRESS_SPRING_DAMPING = 28;
const PRESS_SCALE = 0.97;

// A visible companion to aria-busy: sighted users see the action registered,
// not just a dim button that reads the same as "form not ready". border-current
// picks up the button's own text color; reduced-motion callers get a static
// ring (globals.css neutralises animate-spin), still a clear "working" cue
// next to the disabled state (found via /critique, 2026-09-10).
const PendingSpinner = () => (
  <span
    aria-hidden="true"
    className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
  />
);

export const Button = ({ variant = "primary", className = "", type = "button", pending = false, disabled, children, ...props }: ButtonProps) => (
  <motion.button
    type={type}
    className={`${buttonClassName(variant, className)} inline-flex items-center justify-center gap-2`}
    disabled={disabled || pending}
    aria-busy={pending || undefined}
    whileTap={{ scale: PRESS_SCALE }}
    transition={{ type: "spring", stiffness: PRESS_SPRING_STIFFNESS, damping: PRESS_SPRING_DAMPING }}
    {...props}
  >
    {pending && <PendingSpinner />}
    {children}
  </motion.button>
);
