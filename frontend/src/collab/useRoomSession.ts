/** React's only connection to the collaborative session. */

import { useEffect, useState } from "react";
import { useObservable } from "@/lib/observable";
import { getIdentity } from "@/auth/identity";
import type { Participant } from "@/lib/participant";
import type { ConnectionState, PeerInfo, RoomSession } from "./session";
import { createRoomSession } from "./session";

/**
 * Creates the session for a room and tears it down on the way out. `null` until
 * the effect has run, which is also the window in which the editor has nothing
 * to bind to.
 *
 * Identity is pushed separately: renaming yourself must not reconnect the room.
 */
export function useRoomSession(roomId: string, wsServerUrl: string, participant: Participant): RoomSession | null {
  const [session, setSession] = useState<RoomSession | null>(null);

  useEffect(() => {
    // Read identity at creation time rather than depending on it, so a rename
    // does not recreate the document.
    const created = createRoomSession({ roomId, wsServerUrl, participant: getIdentity() });
    // A WebSocket and a CRDT document are exactly the kind of external resource
    // an effect exists to own: created on mount, destroyed on unmount. Publishing
    // the handle costs one extra render when a room opens, which is the correct
    // trade for never leaking a connection.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(created);
    return () => {
      setSession((current) => (current === created ? null : current));
      created.destroy();
    };
  }, [roomId, wsServerUrl]);

  useEffect(() => {
    session?.setIdentity(participant);
  }, [session, participant]);

  return session;
}

export function useConnectionState(session: RoomSession): ConnectionState {
  return useObservable(session.connection);
}

export function usePeers(session: RoomSession): readonly PeerInfo[] {
  return useObservable(session.peers);
}
