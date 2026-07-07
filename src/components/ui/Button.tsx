import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon rendered before the label (RTL: on the right). */
  leadingIcon?: ReactNode;
  fullWidth?: boolean;
  /** Shows an inline spinner and disables the button while an action runs. */
  loading?: boolean;
}

/** Inline spinner (currentColor) for in-progress buttons. */
export function Spinner({ size = 15 }: { size?: number }) {
  return (
    <svg
      className="animate-spin"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const variantClasses: Record<ButtonVariant, string> = {
  // ZONO gradient system — primary CTAs carry the premium purple gradient + glow.
  primary:
    "btn-zono-primary zono-focus-ring",
  secondary:
    "bg-brand-soft text-brand-strong hover:bg-brand-soft/70 focus-visible:ring-brand/30",
  ghost:
    "bg-transparent text-ink hover:bg-line/60 focus-visible:ring-line",
  danger:
    "bg-danger text-white hover:bg-danger/90 focus-visible:ring-danger/40",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

/** Primary action control for the ZONO design system. */
export function Button({
  variant = "primary",
  size = "md",
  leadingIcon,
  fullWidth,
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        // PHASE 61 — tactile press feedback + smooth transitions (reduced-motion safe).
        "inline-flex items-center justify-center rounded-lg font-semibold",
        "transition-[color,background-color,border-color,box-shadow,transform] duration-150",
        "active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && "w-full",
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner size={size === "lg" ? 18 : 15} /> : leadingIcon}
      {children}
    </button>
  );
}
