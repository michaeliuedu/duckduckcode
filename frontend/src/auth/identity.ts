/**
 * The name and colour other people see on your caret.
 *
 * Two sources, deliberately split:
 *
 *  - Signed in: the name is your account's display name, so your caret in a
 *    room is attributable to the account that publishes problems. Changing it
 *    is a profile edit, not a per-room whim.
 *  - Anonymous: the generated name in `lib/participant`, editable in the room
 *    header. This is the path someone follows a link into, and it must keep
 *    working without an account.
 *
 * The colour is always local: it is a display preference, not an identity.
 */

import { getParticipant, useParticipant, type Participant } from "@/lib/participant";
import { currentUser, useCurrentUser } from "./session";

function merge(user: { displayName: string } | null, local: Participant): Participant {
  return user ? { name: user.displayName, color: local.color } : local;
}

/** The identity to publish into a room. Safe to call outside React. */
export function getIdentity(): Participant {
  return merge(currentUser(), getParticipant());
}

export function useIdentity(): Participant {
  return merge(useCurrentUser(), useParticipant());
}
