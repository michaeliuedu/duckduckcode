/// <reference lib="webworker" />

/**
 * The Python worker: owns the Pyodide interpreter and nothing else.
 *
 * Pyodide is fetched from the official CDN rather than bundled, so the image
 * stays small. The import URL is built at runtime and marked `@vite-ignore` so
 * the bundler leaves it alone.
 */

import { appendResultRepr, appendStdoutBatch, formatPythonError, stripInternalFrames } from "./output";
import { PYODIDE_INDEX_URL, SCRIPT_FILENAME, type WorkerRequest, type WorkerResponse } from "./protocol";
import { TEST_SCRIPT } from "./testScript";
import type { TestOutcome } from "./tests";
import { TRACE_SCRIPT } from "./traceScript";
import type { TraceStep } from "./trace";

interface PyProxy {
  toString(): string;
  destroy?(): void;
}

interface Pyodide {
  runPythonAsync(code: string, options?: { filename?: string; globals?: unknown }): Promise<unknown>;
  setStdout(options: { batched: (text: string) => void }): void;
  setStderr(options: { batched: (text: string) => void }): void;
  globals: { set(name: string, value: unknown): void; delete(name: string): void };
}

const scope = self as unknown as DedicatedWorkerGlobalScope;

function post(message: WorkerResponse): void {
  scope.postMessage(message);
}

let interpreter: Promise<Pyodide> | null = null;

function loadInterpreter(): Promise<Pyodide> {
  if (interpreter) return interpreter;
  post({ kind: "loading" });
  interpreter = (async () => {
    const module = (await import(/* @vite-ignore */ `${PYODIDE_INDEX_URL}pyodide.mjs`)) as {
      loadPyodide(options: { indexURL: string }): Promise<Pyodide>;
    };
    const pyodide = await module.loadPyodide({ indexURL: PYODIDE_INDEX_URL });
    post({ kind: "ready" });
    return pyodide;
  })().catch((error: unknown) => {
    interpreter = null;
    post({ kind: "load-failed", message: describeLoadFailure(error) });
    throw error;
  });
  return interpreter;
}

function describeLoadFailure(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `Could not load Python (Pyodide): ${detail}`;
}

/** Captures stdout/stderr, streaming each chunk to the page as it arrives. */
function captureOutput(pyodide: Pyodide, id: number) {
  const buffers = { out: "", err: "" };
  pyodide.setStdout({
    batched: (text) => {
      buffers.out = appendStdoutBatch(buffers.out, text);
      post({ kind: "stdout", id, channel: "out", chunk: text });
    },
  });
  pyodide.setStderr({
    batched: (text) => {
      buffers.err = appendStdoutBatch(buffers.err, text);
      post({ kind: "stdout", id, channel: "err", chunk: text });
    },
  });
  return buffers;
}

async function handleRun(id: number, code: string): Promise<void> {
  const pyodide = await loadInterpreter();
  const buffers = captureOutput(pyodide, id);
  try {
    const value = await pyodide.runPythonAsync(code, { filename: SCRIPT_FILENAME });
    post({
      kind: "run-result",
      id,
      outcome: { stdout: appendResultRepr(buffers.out, value), stderr: buffers.err },
    });
  } catch (error) {
    post({
      kind: "run-result",
      id,
      outcome: { stdout: buffers.out, stderr: buffers.err, error: formatPythonError(error) },
    });
  }
}

interface RawTrace {
  steps?: TraceStep[];
  stdout?: string;
  stderr?: string;
  truncated?: boolean;
  failed?: boolean;
}

/** The trace script returns a JSON string, possibly as a Python str proxy. */
function readJsonText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const text = (value as PyProxy).toString();
    if (text && text !== "[object Object]") return text;
  }
  return String(value ?? "");
}

async function handleTrace(id: number, code: string): Promise<void> {
  const pyodide = await loadInterpreter();
  // The tracer captures print() into its own buffer, so nothing streams here;
  // stdout arrives with the finished trace.
  captureOutput(pyodide, id);
  pyodide.globals.set("_ddc_source", code);
  try {
    const value = await pyodide.runPythonAsync(TRACE_SCRIPT);
    const parsed = JSON.parse(readJsonText(value)) as RawTrace;
    const stderr = stripInternalFrames(parsed.stderr ?? "");
    post({
      kind: "trace-result",
      id,
      outcome: {
        steps: Array.isArray(parsed.steps) ? parsed.steps : [],
        stdout: parsed.stdout ?? "",
        stderr,
        truncated: Boolean(parsed.truncated),
        error: parsed.failed ? stderr || "Trace failed" : undefined,
      },
    });
  } catch (error) {
    post({
      kind: "trace-result",
      id,
      outcome: { steps: [], stdout: "", stderr: "", truncated: false, error: formatPythonError(error) },
    });
  } finally {
    pyodide.globals.delete("_ddc_source");
  }
}

interface RawTests {
  results?: TestOutcome[];
  setupError?: string;
}

/**
 * Runs the author's cases against the submitted code.
 *
 * The cases go in as JSON and the results come back as JSON, so nothing has to
 * cross the boundary as a live Python object.
 */
async function handleTest(id: number, code: string, entryPoint: string, cases: unknown): Promise<void> {
  const pyodide = await loadInterpreter();
  // The harness captures output per case; nothing should stream out here.
  captureOutput(pyodide, id);
  pyodide.globals.set("_ddc_source", code);
  pyodide.globals.set("_ddc_entry", entryPoint);
  pyodide.globals.set("_ddc_cases", JSON.stringify(cases));
  try {
    const value = await pyodide.runPythonAsync(TEST_SCRIPT);
    const parsed = JSON.parse(readJsonText(value)) as RawTests;
    const setupError = parsed.setupError ?? "";
    post({
      kind: "test-result",
      id,
      outcome: {
        outcomes: Array.isArray(parsed.results) ? parsed.results : [],
        setupError,
        stdout: "",
        stderr: setupError,
        error: setupError || undefined,
      },
    });
  } catch (error) {
    const message = formatPythonError(error);
    post({
      kind: "test-result",
      id,
      outcome: { outcomes: [], setupError: message, stdout: "", stderr: message, error: message },
    });
  } finally {
    pyodide.globals.delete("_ddc_source");
    pyodide.globals.delete("_ddc_entry");
    pyodide.globals.delete("_ddc_cases");
  }
}

scope.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  let work: Promise<void>;
  switch (request.kind) {
    case "run":
      work = handleRun(request.id, request.code);
      break;
    case "trace":
      work = handleTrace(request.id, request.code);
      break;
    case "test":
      work = handleTest(request.id, request.code, request.entryPoint, request.cases);
      break;
  }
  work.catch((error: unknown) => {
    post({ kind: "failed", id: request.id, message: formatPythonError(error) });
  });
});

// Start downloading immediately: the page spawns the worker when a room opens,
// long before anyone presses Run.
void loadInterpreter().catch(() => {
  /* reported to the page as load-failed */
});
