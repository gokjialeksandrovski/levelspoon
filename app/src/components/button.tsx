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
export const buttonClassName = (variant: ButtonVariant = "primary", className = ""): string =>
  `rounded-(--radius-control) px-4 py-2.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text disabled:opacity-50 ${VARIANT[variant]} ${className}`;

// Press-feedback spring (spec §2.5, category 1 of 2). Values come from
// globals.css's --spring-press-* tokens so this and any future
// spring-driven surface share one source of truth.
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
