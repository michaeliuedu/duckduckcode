/**
 * Runtime configuration.
 *
 * `backendUrl` is the base the *browser* uses to reach the Go backend. An empty
 * string means "the page's own origin", which is the production setup (the ALB
 * routes /api and /ws to the backend) and also development (the Vite dev server
 * proxies them). An absolute http(s) URL is only needed when the backend lives
 * on a different origin.
 *
 * Resolution order, first match wins:
 *   1. `VITE_BACKEND_URL` — build/dev-time override, handy for `npm run dev`
 *      against a deployed backend.
 *   2. `window.__DUCKDUCKCODE__.backendUrl` — written into /runtime-config.js by
 *      the container entrypoint from `BACKEND_PUBLIC_URL`.
 *   3. `""` — same origin.
 */

export interface AppConfig {
  readonly backendUrl: string;
}

declare global {
  interface Window {
    __DUCKDUCKCODE__?: { backendUrl?: unknown };
  }
}

/** Trims whitespace and trailing slashes so URL joins are predictable. */
export function normalizeBase(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\/+$/, "") : "";
}

export function resolveConfig(
  env: { VITE_BACKEND_URL?: string } = import.meta.env,
  injected: { backendUrl?: unknown } | undefined = typeof window === "undefined" ? undefined : window.__DUCKDUCKCODE__,
): AppConfig {
  const fromEnv = normalizeBase(env.VITE_BACKEND_URL);
  if (fromEnv) return { backendUrl: fromEnv };
  return { backendUrl: normalizeBase(injected?.backendUrl) };
}

export const config: AppConfig = resolveConfig();
