/**
 * A workspace panel: a bordered card with a fixed toolbar and a scrolling body.
 *
 * Every pane in the room is one of these, which is what keeps the three regions
 * looking like parts of one workspace however they are resized.
 */

import type { ReactNode } from "react";

export interface PanelProps {
  children: ReactNode;
  className?: string;
  testId?: string;
  /** Accessible name, for the panel's landmark role. */
  label?: string;
}

export function Panel({ children, className = "", testId, label }: PanelProps) {
  return (
    <section className={`panel ${className}`.trim()} data-testid={testId} aria-label={label}>
      {children}
    </section>
  );
}

/** The fixed strip at the top of a panel: tabs on the left, actions on the right. */
export function PanelBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`panel-bar ${className}`.trim()}>{children}</div>;
}

/** A group of controls at the right-hand end of a `PanelBar`. */
export function BarActions({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`ml-auto flex shrink-0 items-center gap-1.5 ${className}`.trim()}>{children}</div>;
}

/** The scrolling region of a panel. */
export function PanelBody({
  children,
  className = "",
  scroll = true,
  testId,
}: {
  children: ReactNode;
  className?: string;
  scroll?: boolean;
  testId?: string;
}) {
  return (
    <div className={`min-h-0 min-w-0 flex-1 ${scroll ? "overflow-auto" : "overflow-hidden"} ${className}`.trim()} data-testid={testId}>
      {children}
    </div>
  );
}

/** A file-name-style label, e.g. "main.py". */
export function PanelFileName({ children }: { children: ReactNode }) {
  return <span className="hidden font-mono text-[12px] text-[var(--muted)] sm:inline">{children}</span>;
}
