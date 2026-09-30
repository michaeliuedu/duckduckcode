/**
 * Who is signed in.
 *
 * `ensureSession()` resolves the session exactly once and hands every caller
 * the same promise. Route guards await it, so a guarded route works on a cold
 * page load without depending on some earlier code having finished first —
 * relying on that ordering is how a signed-in person ends up bounced to the
 * sign-in page by their own bookmark.
 *
 * `main.tsx` starts it before rendering so the request is already in flight by
 * the time a loader asks, but nothing breaks if it has not finished.
 */

import { api } from "@/api/client";
import type { User } from "@/api/types";
import { observable, useObservable } from "@/lib/observable";

const store = observable<User | null>(null, {
  equals: (a, b) => a?.id === b?.id && a?.handle === b?.handle && a?.displayName === b?.displayName,
});

let inflight: Promise<void> | null = null;

/**
 * Resolves once the session is known. Never rejects: a backend that is down
 * should leave the app usable for anonymous room work rather than blocking the
 * first paint on an error.
 */
export function ensureSession(): Promise<void> {
  inflight ??= api
    .me()
    .then(({ user }) => store.set(user))
    .catch(() => store.set(null));
  return inflight;
}

/**
 * The signed-in user, or null. Only meaningful after `ensureSession()` has
 * resolved; guards await it first.
 */
export function currentUser(): User | null {
  return store.get();
}

export function useCurrentUser(): User | null {
  return useObservable(store);
}

/** Records the result of any call that returns the current user. */
export function setCurrentUser(user: User | null): void {
  // Signing in or out is itself an authoritative answer, so a later
  // ensureSession() must not overwrite it with a stale fetch.
  inflight = Promise.resolve();
  store.set(user);
}
