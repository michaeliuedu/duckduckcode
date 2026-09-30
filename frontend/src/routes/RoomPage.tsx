/**
 * The room route.
 *
 * Its only job is to turn loaded data into a connected session and hand that to
 * the workspace. The collaborative document is created once per room here, which
 * is why the rest of the room can treat `session` as always present.
 */

import { useEffect, useMemo } from "react";
import { useLoaderData } from "react-router";
import { roomLink, wsServerUrl } from "@/api/urls";
import { useRoomSession } from "@/collab/useRoomSession";
import { config } from "@/config";
import { RoomProvider } from "@/features/room/RoomContext";
import { RoomWorkspace } from "@/features/room/RoomWorkspace";
import { useIdentity } from "@/auth/identity";
import { preloadPython } from "@/python/runner";
import { AppHeader } from "@/ui/AppHeader";
import { Spinner } from "@/ui/Spinner";
import type { RoomLoaderData } from "./loaders";

export function RoomPage() {
  const { roomId, room, problem } = useLoaderData() as RoomLoaderData;
  const participant = useIdentity();

  // Both depend only on the page's own origin, which cannot change under us.
  const wsUrl = useMemo(() => wsServerUrl(config.backendUrl, window.location.origin), []);
  const shareLink = useMemo(() => roomLink(window.location.origin, roomId), [roomId]);

  const session = useRoomSession(roomId, wsUrl, participant);

  // Start fetching the interpreter now; the first Run should not also be the
  // first ten megabytes.
  useEffect(() => {
    preloadPython();
  }, []);

  if (!session) return <RoomConnecting />;

  return (
    <RoomProvider value={{ roomId, room, problem, shareLink, session }}>
      <RoomWorkspace />
    </RoomProvider>
  );
}

function RoomConnecting() {
  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />
      <main className="flex flex-1 items-center justify-center gap-2 text-[13px] text-[var(--muted)]">
        <Spinner />
        Opening the workspace…
      </main>
    </div>
  );
}

export default RoomPage;
