"use client";

import { motion } from "motion/react";

export type ButtonVariant = "primary" | "ghost" | "danger";

// Native onDrag*/onAnimation* handlers are omitted: motion.button redefines
// them with its own gesture/animation-lifecycle signatures, incompatible
// with React's native DOM event handler types. No existing call site passes
// these props (verified via repo search).
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
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-text text-bg hover:brightness-90",
  ghost: "bg-surface-raised text-text hover:bg-border",
  danger: "border border-danger text-danger hover:bg-danger/10",
};

// Exported so a non-<button> element that must look like a Button (e.g. a
// next/link styled as a call-to-action) can share this exact class recipe
// instead of duplicating it - see meal-detail.tsx.
//
// py-3 (not py-2.5): 10px sat off the app's 4pt spacing scale, and text-sm's
// 20px line-height + 2*12px padding lands exactly on the 44px touch-target
// floor as a side effect (found via /critique, 2026-09-09).
export const buttonClassName = (variant: ButtonVariant = "primary", className = ""): string =>
  `rounded-(--radius-control) px-4 py-3 text-sm font-medium transition-transform duration-100 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text disabled:opacity-50 disabled:active:scale-100 ${VARIANT[variant]} ${className}`;

// Press-feedback spring (spec §2.5, category 1 of 2). Plain JS constants,
// not read from globals.css - motion/react's spring config needs numeric
// values, not CSS custom properties, so these are defined directly here
// rather than pretending to share a token with the (removed) CSS-side
// spring variables.
const PRESS_SPRING_STIFFNESS = 400;
const PRESS_SPRING_DAMPING = 28;
const PRESS_SCALE = 0.97;

export const Button = ({ variant = "primary", className = "", type = "button", ...props }: ButtonProps) => (
  <motion.button
    type={type}
    className={buttonClassName(variant, className)}
    whileTap={{ scale: PRESS_SCALE }}
    transition={{ type: "spring", stiffness: PRESS_SPRING_STIFFNESS, damping: PRESS_SPRING_DAMPING }}
    {...props}
  />
);
