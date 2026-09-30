/**
 * The bar across the top of every page: wordmark on the left, page-specific
 * content in the middle, actions and the theme toggle on the right.
 */

import type { ReactNode } from "react";
import { AccountMenu } from "./AccountMenu";
import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";

export function AppHeader({ children, actions }: { children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="app-header">
      <Brand />
      {children}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {actions}
        <ThemeToggle />
        <AccountMenu />
      </div>
    </header>
  );
}

/** A slash between the wordmark and a page title. */
export function HeaderSeparator() {
  return (
    <span className="hidden select-none text-[var(--line-strong)] sm:inline" aria-hidden>
      /
    </span>
  );
}
