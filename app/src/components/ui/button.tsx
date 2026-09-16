"use client";

import { motion } from "motion/react";

import { TAP_HIT_AREA_SM } from "./tap-target";

export type ButtonVariant = "primary" | "ghost" | "danger" | "fat";

// motion.button redefines onDrag*/onAnimation* with incompatible signatures,
// so they're omitted here; no call site passes them anyway.
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
  link?: boolean;
  // Disables the button (can't double-fire) and sets aria-busy so a screen
  // reader announces "busy" instead of reading a plain disabled/not-ready state.
  pending?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-text text-bg hover:brightness-90",
  ghost: "bg-surface-raised text-text hover:bg-border",
  danger: "border border-danger text-danger hover:bg-danger/10",
  fat: "border border-accent-fat text-accent-fat hover:bg-accent-fat/10",
};

const LINK_VARIANT: Record<ButtonVariant, string> = {
  primary: "text-text",
  ghost: "text-text-muted",
  danger: "text-danger",
  fat: "text-accent-fat",
};

// Exported so a non-<button> element (e.g. a next/link CTA) can share this
// class recipe - see meal-detail.tsx.
// py-3 (not py-2.5): lands text-sm's 20px line-height + padding exactly on
// the 44px touch-target floor.
export const buttonClassName = (variant: ButtonVariant = "primary", className = "", link = false): string =>
  link
    ? `${TAP_HIT_AREA_SM} text-sm underline disabled:cursor-not-allowed disabled:opacity-50 ${LINK_VARIANT[variant]} ${className}`
    : `rounded-(--radius-control) px-4 py-3 text-sm font-medium transition-transform duration-100 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${VARIANT[variant]} ${className}`;

// Press-feedback spring (spec §2.5). Plain JS constants: motion/react's
// spring config needs numbers, not CSS custom properties.
const PRESS_SPRING_STIFFNESS = 400;
const PRESS_SPRING_DAMPING = 28;
const PRESS_SCALE = 0.97;

// Visible companion to aria-busy: sighted users see progress, not just a dim
// disabled button. globals.css neutralises animate-spin for reduced motion.
const PendingSpinner = () => (
  <span
    aria-hidden="true"
    className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
  />
);

export const Button = ({ variant = "primary", link = false, className = "", type = "button", pending = false, disabled, children, ...props }: ButtonProps) => (
  <motion.button
    type={type}
    className={`${buttonClassName(variant, className, link)} inline-flex items-center justify-center gap-2`}
    disabled={disabled || pending}
    aria-busy={pending || undefined}
    whileTap={{ scale: PRESS_SCALE }}
    transition={{ type: "spring", stiffness: PRESS_SPRING_STIFFNESS, damping: PRESS_SPRING_DAMPING }}
    {...props}
  >
    {pending && <PendingSpinner />}
    {link ? <span>{children}</span> : children}
  </motion.button>
);
