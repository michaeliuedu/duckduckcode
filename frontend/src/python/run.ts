/**
 * The result of a run, as shared between everyone in the room.
 *
 * Stored as JSON in the room's Yjs metadata map, so every field is validated on
 * the way in: a peer on an older build (or a corrupted value) must not be able
 * to crash the panel.
 */

export type RunStatus = "idle" | "running" | "ok" | "error";

export interface RunResult {
  status: Exclude<RunStatus, "idle">;
  stdout: string;
  stderr: string;
  /** Display name of whoever pressed Run. */
  by: string;
  /** Epoch milliseconds, for the timestamp in the panel. */
  at: number;
  /** Wall-clock execution time, absent on older results. */
  durationMs?: number;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseRunResult(raw: unknown): RunResult | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<RunResult>;
  if (candidate.status !== "running" && candidate.status !== "ok" && candidate.status !== "error") return null;
  if (typeof candidate.by !== "string" || typeof candidate.at !== "number") return null;
  const result: RunResult = {
    status: candidate.status,
    stdout: asString(candidate.stdout),
    stderr: asString(candidate.stderr),
    by: candidate.by,
    at: candidate.at,
  };
  if (typeof candidate.durationMs === "number" && Number.isFinite(candidate.durationMs)) {
    result.durationMs = candidate.durationMs;
  }
  return result;
}

/** True when nothing was printed and nothing failed. */
export function isEmptyRun(result: RunResult): boolean {
  return result.stdout.length === 0 && result.stderr.length === 0;
}
