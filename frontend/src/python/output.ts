/** Turning Pyodide's output and errors into something worth reading. */

/**
 * Pyodide's batched writer hands us each line *without* the newline that
 * `print()` wrote, so appending chunks naively runs every line together.
 */
export function appendStdoutBatch(accumulated: string, chunk: string): string {
  if (!chunk) return accumulated;
  return accumulated + (chunk.endsWith("\n") ? chunk : `${chunk}\n`);
}

/**
 * Pyodide wraps Python tracebacks in a JS Error whose message is prefixed with
 * "PythonError: ". Students should see the traceback, not the wrapper.
 */
export function formatPythonError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const marker = "PythonError: ";
  const index = raw.indexOf(marker);
  return index >= 0 ? raw.slice(index + marker.length).trim() : raw.trim();
}

/**
 * The value of the last expression, appended to stdout the way a REPL would.
 * `None` and empty results are not worth a line.
 */
export function appendResultRepr(stdout: string, value: unknown): string {
  if (value === undefined || value === null) return stdout;
  const text = String(value);
  if (!text || text === "undefined" || text === "None") return stdout;
  const separator = stdout && !stdout.endsWith("\n") ? "\n" : "";
  return `${stdout}${separator}${text}${text.endsWith("\n") ? "" : "\n"}`;
}

/** Strips the tracer's own frames from a traceback so only user frames remain. */
export function stripInternalFrames(traceback: string): string {
  const lines = traceback.split("\n");
  const kept = lines.filter((line) => !/File "<exec>"|in (visible_locals|user_stack|tracer|describe)\b/.test(line));
  return kept.join("\n").trim();
}
