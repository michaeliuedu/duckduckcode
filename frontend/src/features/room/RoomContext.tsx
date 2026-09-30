/**
 * What every part of a room needs to know: which room it is, what problem it
 * carries, and the live session.
 *
 * Only the values that genuinely belong to "the room" are here. Transient state
 * — which console tab is open, what is running — stays as props, so it is obvious
 * from a component's signature what it actually reacts to.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { Problem, Room } from "@/api/types";
import type { RoomSession } from "@/collab/session";

export interface RoomContextValue {
  roomId: string;
  room: Room;
  /** The practice problem, or `null` for a blank workspace. */
  problem: Problem | null;
  /** Absolute link to this room, for sharing. */
  shareLink: string;
  session: RoomSession;
}

const RoomContext = createContext<RoomContextValue | null>(null);

export function RoomProvider({ value, children }: { value: RoomContextValue; children: ReactNode }) {
  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomContextValue {
  const value = useContext(RoomContext);
  if (!value) throw new Error("useRoom must be used inside a RoomProvider");
  return value;
}

/** The room's display title. */
export function roomTitle(problem: Problem | null): string {
  return problem ? problem.title : "Blank workspace";
}
