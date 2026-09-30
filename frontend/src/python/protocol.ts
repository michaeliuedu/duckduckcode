/**
 * Messages exchanged with the Python worker.
 *
 * Python runs in a Web Worker rather than on the main thread for two reasons:
 * the page stays responsive while Pyodide downloads and while code runs, and a
 * run that never finishes (`while True: pass`) can actually be stopped — on the
 * main thread a timeout can never fire, because the blocking loop owns the very
 * thread the timer would run on.
 */

import type { TestCase, TestOutcome } from "./tests";
import type { TraceStep } from "./trace";

export const PYODIDE_VERSION = "0.27.5";
export const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

/** The name user code is compiled under; tracebacks and traces both use it. */
export const SCRIPT_FILENAME = "main.py";

export interface PythonOutcome {
  stdout: string;
  stderr: string;
  /** Present when execution failed, timed out or was stopped. */
  error?: string;
}

export interface PythonTraceOutcome extends PythonOutcome {
  steps: TraceStep[];
  truncated: boolean;
}

export interface PythonTestOutcome extends PythonOutcome {
  outcomes: TestOutcome[];
  /** The code could not be loaded at all, so nothing ran. */
  setupError: string;
}

export type StdoutChannel = "out" | "err";

export type WorkerRequest =
  | { kind: "run"; id: number; code: string }
  | { kind: "trace"; id: number; code: string }
  | { kind: "test"; id: number; code: string; entryPoint: string; cases: TestCase[] };

/**
 * A request without its id. Distributive, so each variant keeps its own fields
 * — a plain `Omit` over a union collapses to the keys they share.
 */
export type WorkerRequestBody = WorkerRequest extends infer T
  ? T extends { id: number }
    ? Omit<T, "id">
    : never
  : never;

export type WorkerResponse =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "load-failed"; message: string }
  | { kind: "stdout"; id: number; channel: StdoutChannel; chunk: string }
  | { kind: "run-result"; id: number; outcome: PythonOutcome }
  | { kind: "trace-result"; id: number; outcome: PythonTraceOutcome }
  | { kind: "test-result"; id: number; outcome: PythonTestOutcome }
  | { kind: "failed"; id: number; message: string };
