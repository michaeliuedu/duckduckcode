// Client-side API helpers. All URLs are derived from a single "backend base"
// string: empty means the backend shares the page's origin (the AWS setup,
// where the ALB routes /api and /ws to the Go service), otherwise it is an
// absolute http(s) URL (local development).

export type Mode = "practice" | "blank";

export interface Room {
  id: string;
  mode: Mode;
  problemId: string | null;
  language: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProblemExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface Problem {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard" | string;
  summary: string;
  statement: string;
  examples: ProblemExample[];
  starterCode: string;
  language: string;
}

export interface ProblemSummary {
  id: string;
  title: string;
  difficulty: string;
  summary: string;
  language: string;
}

export interface RoomResponse {
  room: Room;
  problem?: Problem;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Removes trailing slashes so joins are predictable. */
export function normalizeBase(base: string | undefined | null): string {
  return (base ?? "").trim().replace(/\/+$/, "");
}

/** Builds an HTTP URL for an API path. */
export function apiUrl(base: string, path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeBase(base)}${p}`;
}

/**
 * Builds the WebSocket server URL that y-websocket connects to; it appends
 * `/<roomId>` itself, so this returns the `/ws/rooms` prefix.
 */
export function wsServerUrl(base: string, pageOrigin: string): string {
  const b = normalizeBase(base);
  const origin = b === "" ? pageOrigin : b;
  const url = new URL(origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/rooms";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

/** Shareable room link for the current page origin. */
export function roomLink(pageOrigin: string, roomId: string): string {
  return `${normalizeBase(pageOrigin)}/rooms/${encodeURIComponent(roomId)}`;
}

async function request<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(base, path), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export function listProblems(base: string): Promise<{ problems: ProblemSummary[] }> {
  return request(base, "/api/problems");
}

export function getProblem(base: string, id: string): Promise<Problem> {
  return request(base, `/api/problems/${encodeURIComponent(id)}`);
}

export function createRoom(base: string, body: { mode: "blank" } | { mode: "practice"; problemId: string }): Promise<RoomResponse> {
  return request(base, "/api/rooms", { method: "POST", body: JSON.stringify(body) });
}

export function getRoom(base: string, id: string): Promise<RoomResponse> {
  return request(base, `/api/rooms/${encodeURIComponent(id)}`);
}
