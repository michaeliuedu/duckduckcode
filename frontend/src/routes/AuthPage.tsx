/**
 * The shell the sign-in and sign-up pages share.
 *
 * Both are the same shape — a heading, a line of explanation, a form on a card,
 * and a link to the other one — and keeping that in one place is what stops the
 * two drifting apart.
 */

import type { ReactNode } from "react";
import { AppHeader } from "@/ui/AppHeader";

export function AuthPage({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  /** The form, rendered on the card. */
  children: ReactNode;
  /** The link to the other page, under the card. */
  footer: ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />
      <main className="flex flex-1 justify-center overflow-y-auto px-6 py-14">
        <div className="w-full max-w-[400px]">
          <h1 className="text-[26px] font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--muted)]">{description}</p>
          <div className="auth-card mt-6">{children}</div>
          <p className="mt-5 text-[13px] text-[var(--muted)]">{footer}</p>
        </div>
      </main>
    </div>
  );
}
