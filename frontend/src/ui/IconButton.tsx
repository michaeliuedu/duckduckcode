/**
 * A square, icon-only button. `label` is mandatory: an icon with no accessible
 * name is a button nobody using a screen reader can identify.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> {
  label: string;
  icon: ReactNode;
  /** Renders in the pressed state, for toggles. */
  active?: boolean;
  className?: string;
}

export function IconButton({ label, icon, active, className = "", type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      title={rest.title ?? label}
      data-active={active ? "true" : undefined}
      className={`icon-btn ${className}`.trim()}
      {...rest}
    >
      {icon}
    </button>
  );
}
