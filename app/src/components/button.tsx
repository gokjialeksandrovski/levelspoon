interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger";
}

const VARIANT: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-accent text-(--color-accent-ink) hover:brightness-95",
  ghost: "bg-surface-raised text-text hover:bg-border",
  danger: "border border-danger text-danger hover:bg-danger/10",
};

export const Button = ({ variant = "primary", className = "", type = "button", ...props }: ButtonProps) => (
  <button
    type={type}
    className={`rounded-(--radius-control) px-4 py-2.5 text-sm font-medium transition-transform duration-100 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 disabled:active:scale-100 ${VARIANT[variant]} ${className}`}
    {...props}
  />
);
