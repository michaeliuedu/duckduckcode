/**
 * The page's handle on the Python worker.
 *
 * One worker, one request at a time. A request that outlives its timeout — or
 * that the user stops — terminates the worker and resolves with whatever was
 * printed before it died; the next request spawns a fresh one (Pyodide comes
 * from the HTTP cache the second time).
 */

import { observable, type Observable } from "@/lib/observable";
import { appendStdoutBatch } from "./output";
import type {
  PythonOutcome,
  PythonTestOutcome,
  PythonTraceOutcome,
  StdoutChannel,
  WorkerRequest,
  WorkerRequestBody,
  WorkerResponse,
} from "./protocol";
import type { TestCase } from "./tests";

export type PythonStatus = "idle" | "loading" | "ready" | "failed";

export const DEFAULT_RUN_TIMEOUT_MS = 10_000;
export const DEFAULT_TRACE_TIMEOUT_MS = 15_000;
// Tests run the module once and then every case, so they get more room.
export const DEFAULT_TEST_TIMEOUT_MS = 20_000;

const status = observable<PythonStatus>("idle");

/** Whether Pyodide is downloaded and ready; drives the "Loading Python…" hint. */
export const pythonStatus: Observable<PythonStatus> = status;

/** Why loading failed, when it did. */
export const pythonLoadError = observable<string | null>(null);

export interface ExecuteOptions {
  timeoutMs?: number;
  /** Called for each chunk printed while the code runs. */
  onOutput?: (chunk: string, channel: StdoutChannel) => void;
  signal?: AbortSignal;
}

/** Everything a request can resolve to, before it is narrowed by kind. */
type AnyOutcome = PythonOutcome & Partial<PythonTraceOutcome> & Partial<PythonTestOutcome>;

interface Pending {
  id: number;
  stdout: string;
  stderr: string;
  timer: number | undefined;
  onOutput: ExecuteOptions["onOutput"];
  settle: (outcome: AnyOutcome) => void;
  /**
   * The empty result to fall back on when the worker dies mid-request, so a
   * caller always gets the shape its kind promises.
   */
  empty: Partial<AnyOutcome>;
}

let worker: Worker | null = null;
let workerUnsupported = false;
let nextId = 1;
const pending = new Map<number, Pending>();

function spawn(): Worker | null {
  try {
    const created = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "duckduckcode-python" });
    created.addEventListener("message", (event: MessageEvent<WorkerResponse>) => receive(event.data));
    created.addEventListener("error", (event) => {
      failAll(event.message || "The Python worker crashed.");
      status.set("failed");
      pythonLoadError.set(event.message || "The Python worker crashed.");
    });
    return created;
  } catch (error) {
    // Construction only fails where module workers are unavailable; there is no
    // point retrying on every Run.
    workerUnsupported = true;
    const message = error instanceof Error ? error.message : String(error);
    status.set("failed");
    pythonLoadError.set(`This browser cannot run Python here: ${message}`);
    return null;
  }
}

function ensureWorker(): Worker | null {
  if (workerUnsupported) return null;
  worker ??= spawn();
  return worker;
}

/** Starts the download early so the first Run is not also the first fetch. */
export function preloadPython(): void {
  if (typeof window === "undefined") return;
  ensureWorker();
}

function finish(entry: Pending, outcome: Partial<AnyOutcome>): void {
  window.clearTimeout(entry.timer);
  pending.delete(entry.id);
  entry.settle({ ...entry.empty, stdout: entry.stdout, stderr: entry.stderr, ...outcome } as AnyOutcome);
}

function receive(message: WorkerResponse): void {
  switch (message.kind) {
    case "loading":
      status.set("loading");
      pythonLoadError.set(null);
      return;
    case "ready":
      status.set("ready");
      pythonLoadError.set(null);
      return;
    case "load-failed":
      status.set("failed");
      pythonLoadError.set(message.message);
      failAll(message.message);
      return;
    case "stdout": {
      const entry = pending.get(message.id);
      if (!entry) return;
      if (message.channel === "out") entry.stdout = appendStdoutBatch(entry.stdout, message.chunk);
      else entry.stderr = appendStdoutBatch(entry.stderr, message.chunk);
      entry.onOutput?.(message.chunk, message.channel);
      return;
    }
    case "run-result":
    case "trace-result":
    case "test-result": {
      const entry = pending.get(message.id);
      if (!entry) return;
      // The worker's own buffers are authoritative — they include output the
      // page may not have received yet.
      finish(entry, message.outcome);
      return;
    }
    case "failed": {
      const entry = pending.get(message.id);
      if (!entry) return;
      finish(entry, { error: message.message });
      return;
    }
  }
}

function failAll(message: string): void {
  for (const entry of [...pending.values()]) finish(entry, { error: message });
}

/** Terminates the interpreter, ending anything in flight. */
export function stopPython(reason = "Stopped."): void {
  worker?.terminate();
  worker = null;
  status.set("idle");
  failAll(reason);
}

function execute(
  request: WorkerRequestBody,
  options: ExecuteOptions,
  timeoutMs: number,
  empty: Partial<AnyOutcome>,
): Promise<AnyOutcome> {
  const active = ensureWorker();
  if (!active) {
    return Promise.resolve({
      ...empty,
      stdout: "",
      stderr: "",
      error: pythonLoadError.get() ?? "Python is unavailable in this browser.",
    } as AnyOutcome);
  }

  const id = nextId++;
  return new Promise<AnyOutcome>((resolve) => {
    const entry: Pending = {
      id,
      stdout: "",
      stderr: "",
      timer: window.setTimeout(() => {
        stopPython(`Timed out after ${Math.round(timeoutMs / 1000)}s. Is there a loop that never ends?`);
      }, timeoutMs),
      onOutput: options.onOutput,
      settle: resolve,
      empty,
    };
    pending.set(id, entry);

    options.signal?.addEventListener("abort", () => {
      if (pending.has(id)) stopPython("Stopped.");
    });

    active.postMessage({ ...request, id } as WorkerRequest);
  });
}

export async function runPython(code: string, options: ExecuteOptions = {}): Promise<PythonOutcome> {
  const { stdout, stderr, error } = await execute(
    { kind: "run", code },
    options,
    options.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS,
    {},
  );
  return { stdout, stderr, error };
}

export function tracePython(code: string, options: ExecuteOptions = {}): Promise<PythonTraceOutcome> {
  return execute({ kind: "trace", code }, options, options.timeoutMs ?? DEFAULT_TRACE_TIMEOUT_MS, {
    steps: [],
    truncated: false,
  }) as Promise<PythonTraceOutcome>;
}

/** Runs the author's cases against `code`, calling `entryPoint` for each. */
export function testPython(
  code: string,
  entryPoint: string,
  cases: TestCase[],
  options: ExecuteOptions = {},
): Promise<PythonTestOutcome> {
  return execute({ kind: "test", code, entryPoint, cases }, options, options.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS, {
    outcomes: [],
    setupError: "",
  }) as Promise<PythonTestOutcome>;
}
