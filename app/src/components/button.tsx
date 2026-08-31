export type ButtonVariant = "primary" | "ghost" | "danger";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-(--color-accent-ink) hover:brightness-95",
  ghost: "bg-surface-raised text-text hover:bg-border",
  danger: "border border-danger text-danger hover:bg-danger/10",
};

// Exported so a non-<button> element that must look like a Button (e.g. a
// next/link styled as a call-to-action) can share this exact class recipe
// instead of duplicating it - see meal-detail.tsx.
export const buttonClassName = (variant: ButtonVariant = "primary", className = ""): string =>
  `rounded-(--radius-control) px-4 py-2.5 text-sm font-medium transition-transform duration-100 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 disabled:active:scale-100 ${VARIANT[variant]} ${className}`;

export const Button = ({ variant = "primary", className = "", type = "button", ...props }: ButtonProps) => (
  <button type={type} className={buttonClassName(variant, className)} {...props} />
);
