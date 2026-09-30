/**
 * Route actions: the only place a room is created.
 *
 * Submitted from the lobby with a fetcher, so the buttons get their pending
 * state from the router and a failure comes back as data to show inline rather
 * than as a thrown error that replaces the page.
 */

import { redirect, type ActionFunctionArgs } from "react-router";
import { ApiError, api } from "@/api/client";
import { roomPath } from "@/api/urls";
import type { CreateRoomRequest } from "@/api/types";

export interface CreateRoomActionData {
  error: string;
}

function readRequest(form: FormData): CreateRoomRequest | null {
  const mode = form.get("mode");
  if (mode === "blank") return { mode: "blank" };
  if (mode !== "practice") return null;
  const problemId = form.get("problemId");
  if (typeof problemId !== "string" || problemId === "") return null;
  return { mode: "practice", problemId };
}

export async function createRoomAction({ request }: ActionFunctionArgs) {
  const body = readRequest(await request.formData());
  if (!body) {
    return { error: "That workspace request was incomplete. Pick a problem and try again." } satisfies CreateRoomActionData;
  }
  try {
    const { room } = await api.createRoom(body, { signal: request.signal });
    return redirect(roomPath(room.id));
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "Could not create the workspace.";
    return { error: message } satisfies CreateRoomActionData;
  }
}
