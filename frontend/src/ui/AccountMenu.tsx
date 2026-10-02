/**
 * The account control in the header: a sign-in link, or your avatar with a
 * menu behind it.
 *
 * Signing out is a form submission rather than a link, because it changes
 * server state — and that also means it goes through the router's action
 * plumbing and the same-origin check.
 */

import { useEffect, useRef, useState } from "react";
import { Form, Link, useLocation } from "react-router";
import { useCurrentUser } from "@/auth/session";
import { initials } from "@/lib/format";
import { useEvent } from "@/lib/hooks";
import { useParticipant } from "@/lib/participant";

export function AccountMenu() {
  const user = useCurrentUser();
  const participant = useParticipant();
  const location = useLocation();
  // The menu remembers which page it was opened on, so a navigation closes it
  // by derivation rather than by an effect that fires after the new page has
  // already rendered with the menu still hanging over it.
  const [menu, setMenu] = useState({ open: false, at: location.pathname });
  const open = menu.open && menu.at === location.pathname;
  const setOpen = (next: boolean) => setMenu({ open: next, at: location.pathname });
  // Stable identity, so the dismiss listeners below are attached once per open.
  const close = useEvent(() => setMenu({ open: false, at: location.pathname }));
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  if (!user) {
    // Carry the current location so signing in returns you here.
    const next = location.pathname + location.search;
    return (
      <Link
        to={next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`}
        className="btn btn-ghost btn-md"
        data-testid="sign-in-link"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.displayName}`}
        data-testid="account-button"
        onClick={() => setOpen(!open)}
        className="account-avatar flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white"
        style={{ backgroundColor: participant.color }}
      >
        <span aria-hidden>{initials(user.displayName)}</span>
      </button>

      {open && (
        <div
          role="menu"
          data-testid="account-menu"
          className="absolute right-0 top-full z-30 mt-1.5 w-56 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] py-1 shadow-[var(--shadow-lifted)]"
        >
          <div className="border-b border-[var(--line)] px-3 pb-2 pt-1.5">
            <p className="truncate text-[13px] font-medium">{user.displayName}</p>
            <p className="truncate text-[12px] text-[var(--muted)]">@{user.handle}</p>
          </div>
          <Link
            role="menuitem"
            to={`/u/${user.handle}`}
            className="account-menu-item"
            data-testid="account-profile"
          >
            Your profile
          </Link>
          <Link role="menuitem" to="/settings" className="account-menu-item" data-testid="account-settings">
            Settings
          </Link>
          <Form method="post" action="/logout">
            <button type="submit" role="menuitem" className="account-menu-item w-full" data-testid="sign-out">
              Sign out
            </button>
          </Form>
        </div>
      )}
    </div>
  );
}
