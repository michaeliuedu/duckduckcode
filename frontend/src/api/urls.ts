/**
 * Every URL the browser uses, derived from one "backend base" string.
 *
 * An empty base means the backend shares the page's origin (production behind
 * the ALB, and development behind the Vite proxy). An absolute http(s) URL
 * points at a backend on another origin.
 *
 * Pure functions with no dependency on `config` or `window`, so they are
 * straightforward to test.
 */

import { normalizeBase } from "@/config";

export { normalizeBase };

/** An HTTP URL for an API path. Relative when the backend is same-origin. */
export function apiUrl(base: string, path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeBase(base)}${suffix}`;
}

/**
 * The WebSocket server URL that y-websocket connects to. It appends
 * `/<roomId>` itself, so this returns the `/ws/rooms` prefix.
 */
export function wsServerUrl(base: string, pageOrigin: string): string {
  const normalized = normalizeBase(base);
  const url = new URL(normalized === "" ? pageOrigin : normalized);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/rooms";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

/** The in-app path for a room. */
export function roomPath(roomId: string): string {
  return `/rooms/${encodeURIComponent(roomId)}`;
}

/** The shareable absolute link for a room. */
export function roomLink(pageOrigin: string, roomId: string): string {
  return `${normalizeBase(pageOrigin)}${roomPath(roomId)}`;
}
