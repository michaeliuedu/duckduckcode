/**
 * The one button.
 *
 * Variants describe intent, not appearance, so the visual design lives entirely
 * in the `btn-*` classes in index.css and a rethemed button needs no component
 * changes.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "run" | "ghost" | "quiet" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks activation. */
  busy?: boolean;
  /** Leading icon; hidden from assistive technology. */
  icon?: ReactNode;
  className?: string;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "btn btn-primary",
  run: "btn btn-run",
  ghost: "btn btn-ghost",
  quiet: "btn btn-quiet",
  danger: "btn btn-danger",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "btn-sm",
  md: "btn-md",
};

export function Button({
  variant = "ghost",
  size = "md",
  busy = false,
  icon,
  disabled,
  children,
  className = "",
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`${VARIANTS[variant]} ${SIZES[size]} ${className}`.trim()}
      {...rest}
    >
      {busy ? <Spinner size={size === "sm" ? 11 : 12} /> : icon}
      {children}
    </button>
  );
}
