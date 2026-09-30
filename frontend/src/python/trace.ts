/**
 * A recorded execution: one entry per line executed, with the locals visible at
 * that point. Like the run result, this travels through the room's Yjs metadata
 * map, so everything is validated on the way in.
 */

export type TraceEvent = "line" | "return" | "exception";

/**
 * The shape of a container, as the tracer saw it.
 *
 * One level deep: every cell is already a short repr, so a list of dicts is a
 * row of dict reprs rather than a tree. That is a deliberate ceiling — the
 * trace is replicated to everyone in the room, and a recursive dump of a large
 * structure at 350 steps is not something worth sending.
 *
 * `n` is the true length, which can exceed the number of cells sent.
 */
export type TraceValue =
  | { t: "seq"; kind: string; items: string[]; n: number }
  | { t: "text"; chars: string[]; n: number }
  | { t: "set"; kind: string; items: string[]; n: number }
  | { t: "map"; kind: string; entries: [string, string][]; n: number }
  | { t: "grid"; kind: string; rows: string[][] }
  | { t: "graph"; nodes: string[]; edges: [string, string][] };

export interface TraceLocal {
  name: string;
  repr: string;
  /** Python type name, e.g. "int", "list". */
  kind: string;
  /** Present when the value is a container the tracer could describe. */
  value?: TraceValue;
}

export interface TraceFrame {
  fn: string;
  line: number;
}

export interface TraceStep {
  line: number;
  event: TraceEvent;
  fn: string;
  locals: TraceLocal[];
  stack: TraceFrame[];
  /** Everything printed up to and including this step. */
  stdout: string;
  exception?: string;
  returnValue?: string;
}

export interface TraceResult {
  status: "running" | "ok" | "error";
  /** The source as it was when the trace started, so line numbers still line up. */
  source: string;
  steps: TraceStep[];
  stdout: string;
  stderr: string;
  /** The step cap was reached and recording stopped early. */
  truncated: boolean;
  by: string;
  at: number;
  durationMs?: number;
}

/** Recording stops here so a tight loop cannot produce an unbounded trace. */
export const MAX_TRACE_STEPS = 350;

/** How many cells one container may contribute to the structured view. */
export const MAX_VALUE_CELLS = 24;

/**
 * The cell budget for a whole trace. Past this the tracer stops attaching
 * structure and the panel falls back to reprs, which keeps a program that holds
 * several large lists across hundreds of steps from producing a payload nobody
 * wants replicated.
 */
export const MAX_TRACE_CELLS = 20000;

const EVENTS = new Set<string>(["line", "return", "exception"]);

/** Every cell arrives as a string; anything else is someone else's bug. */
function asCells(raw: unknown, limit = MAX_VALUE_CELLS): string[] | null {
  if (!Array.isArray(raw) || raw.length > limit) return null;
  if (!raw.every((cell) => typeof cell === "string")) return null;
  return raw as string[];
}

function asPairs(raw: unknown, limit: number): [string, string][] | null {
  if (!Array.isArray(raw) || raw.length > limit) return null;
  const pairs: [string, string][] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    if (typeof entry[0] !== "string" || typeof entry[1] !== "string") return null;
    pairs.push([entry[0], entry[1]]);
  }
  return pairs;
}

function asCount(raw: unknown, atLeast: number): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const n = Math.trunc(raw);
  return n >= atLeast ? n : null;
}

/**
 * Validates a structured value off the wire.
 *
 * This arrives through the room's shared metadata, which means it arrives from
 * the other person's browser. Anything that does not match exactly is dropped
 * rather than repaired: the panel renders the repr instead, which is always
 * present.
 */
function asValue(raw: unknown): TraceValue | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const kind = typeof v.kind === "string" ? v.kind : "";

  switch (v.t) {
    case "seq":
    case "set": {
      const items = asCells(v.items);
      if (!items) return null;
      const n = asCount(v.n, items.length);
      if (n === null || !kind) return null;
      return { t: v.t, kind, items, n };
    }
    case "text": {
      const chars = asCells(v.chars);
      if (!chars) return null;
      const n = asCount(v.n, chars.length);
      if (n === null) return null;
      return { t: "text", chars, n };
    }
    case "map": {
      const entries = asPairs(v.entries, MAX_VALUE_CELLS);
      if (!entries || !kind) return null;
      const n = asCount(v.n, entries.length);
      if (n === null) return null;
      return { t: "map", kind, entries, n };
    }
    case "grid": {
      if (!Array.isArray(v.rows) || v.rows.length > MAX_VALUE_CELLS || !kind) return null;
      const rows: string[][] = [];
      for (const row of v.rows) {
        const cells = asCells(row);
        if (!cells) return null;
        rows.push(cells);
      }
      // Rectangular is the whole premise of drawing it as a grid.
      if (rows.length === 0 || new Set(rows.map((row) => row.length)).size !== 1) return null;
      return { t: "grid", kind, rows };
    }
    case "graph": {
      const nodes = asCells(v.nodes);
      const edges = asPairs(v.edges, MAX_VALUE_CELLS * 4);
      if (!nodes || !edges || nodes.length === 0) return null;
      // An edge to a node that is not in the list would have nowhere to land.
      const known = new Set(nodes);
      if (edges.some(([from, to]) => !known.has(from) || !known.has(to))) return null;
      return { t: "graph", nodes, edges };
    }
    default:
      return null;
  }
}

function asLocal(raw: unknown): TraceLocal | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Partial<TraceLocal>;
  if (typeof v.name !== "string" || typeof v.repr !== "string" || typeof v.kind !== "string") return null;
  const local: TraceLocal = { name: v.name, repr: v.repr, kind: v.kind };
  const value = asValue(v.value);
  if (value) local.value = value;
  return local;
}

function asFrame(raw: unknown): TraceFrame | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Partial<TraceFrame>;
  if (typeof v.fn !== "string" || typeof v.line !== "number") return null;
  return { fn: v.fn, line: v.line };
}

function asStep(raw: unknown): TraceStep | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Partial<TraceStep> & { return?: unknown };
  if (typeof v.line !== "number" || typeof v.fn !== "string") return null;
  if (typeof v.event !== "string" || !EVENTS.has(v.event)) return null;
  if (!Array.isArray(v.locals) || !Array.isArray(v.stack) || typeof v.stdout !== "string") return null;
  const step: TraceStep = {
    line: v.line,
    event: v.event as TraceEvent,
    fn: v.fn,
    locals: v.locals.map(asLocal).filter((x): x is TraceLocal => x !== null),
    stack: v.stack.map(asFrame).filter((x): x is TraceFrame => x !== null),
    stdout: v.stdout,
  };
  if (typeof v.exception === "string") step.exception = v.exception;
  // `return` was the wire name before the field was renamed; accept both.
  if (typeof v.returnValue === "string") step.returnValue = v.returnValue;
  else if (typeof v.return === "string") step.returnValue = v.return;
  return step;
}

export function parseTraceResult(raw: unknown): TraceResult | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Partial<TraceResult>;
  if (v.status !== "running" && v.status !== "ok" && v.status !== "error") return null;
  if (typeof v.by !== "string" || typeof v.at !== "number" || typeof v.source !== "string") return null;
  const result: TraceResult = {
    status: v.status,
    source: v.source,
    steps: Array.isArray(v.steps) ? v.steps.map(asStep).filter((x): x is TraceStep => x !== null) : [],
    stdout: typeof v.stdout === "string" ? v.stdout : "",
    stderr: typeof v.stderr === "string" ? v.stderr : "",
    truncated: Boolean(v.truncated),
    by: v.by,
    at: v.at,
  };
  if (typeof v.durationMs === "number" && Number.isFinite(v.durationMs)) result.durationMs = v.durationMs;
  return result;
}

/** Clamps a shared step index into range, tolerating strings and nonsense. */
export function clampStepIndex(raw: unknown, length: number): number {
  if (length <= 0) return 0;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : 0;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(length - 1, Math.trunc(n)));
}

/** The name to show for a frame; the module frame reads better as the filename. */
export function frameLabel(fn: string): string {
  return fn === "<module>" ? "main.py" : fn;
}

/** Locals whose repr differs from the previous step, i.e. what just changed. */
export function changedLocals(current: readonly TraceLocal[], previous: readonly TraceLocal[]): Set<string> {
  if (previous.length === 0) return new Set();
  const before = new Map(previous.map((local) => [local.name, local.repr]));
  const changed = new Set<string>();
  for (const local of current) {
    if (before.get(local.name) !== local.repr) changed.add(local.name);
  }
  return changed;
}

/** The flat cells of a value, for position-by-position comparison. */
function cellsOf(value: TraceValue | undefined): string[] | null {
  if (!value) return null;
  switch (value.t) {
    case "seq":
    case "set":
      return value.items;
    case "text":
      return value.chars;
    case "map":
      return value.entries.map(([key, item]) => `${key}\u0000${item}`);
    case "grid":
      return value.rows.flat();
    case "graph":
      return null;
  }
}

/**
 * Which positions of a container changed since the previous step.
 *
 * "Which cell did that line write to?" is the question a loop over an array
 * raises on every step, and highlighting the whole variable does not answer it.
 *
 * Two cases are worth distinguishing. Same length means a write, so the
 * positions that differ are the answer. Longer, with everything that was there
 * still in place, means something was appended — `append`, or a new key in a
 * dict, which preserves insertion order — so the answer is the new tail. That
 * second case is most of what a lookup table does, and reporting nothing for it
 * would miss the whole story.
 *
 * Anything else (shorter, or reordered) returns no positions: the contents have
 * moved, and pointing at individual cells would mislead rather than help.
 */
export function changedCells(current: TraceValue | undefined, previous: TraceValue | undefined): Set<number> {
  const now = cellsOf(current);
  const before = cellsOf(previous);
  if (!now || !before) return new Set();

  const changed = new Set<number>();
  if (now.length === before.length) {
    for (let i = 0; i < now.length; i++) {
      if (now[i] !== before[i]) changed.add(i);
    }
    return changed;
  }

  if (now.length > before.length && before.every((cell, i) => cell === now[i])) {
    for (let i = before.length; i < now.length; i++) changed.add(i);
  }
  return changed;
}

/** How many cells a value renders as: its length, for anything that has one. */
export function valueLength(value: TraceValue): number {
  switch (value.t) {
    case "seq":
    case "set":
    case "map":
    case "text":
      return value.n;
    case "grid":
      return value.rows.length;
    case "graph":
      return value.nodes.length;
  }
}

/**
 * Names that conventionally hold an index into something.
 *
 * Marking an integer as a cursor is a guess, and a wrong guess puts a caret
 * under the wrong array — so the guess is limited to the names people actually
 * use for the job, plus any single letter. `n`, `size` and `count` are absent
 * on purpose: they are lengths, and a length is exactly one past the end.
 */
const POINTER_NAMES = new Set([
  "i", "j", "k", "l", "r", "lo", "hi", "left", "right", "mid", "middle",
  "start", "end", "begin", "first", "last", "idx", "index", "pos", "position",
  "cursor", "head", "tail", "read", "write", "slow", "fast", "low", "high",
]);

/**
 * Names that hold a size rather than a position. Checked before the
 * single-letter rule below, which would otherwise readmit `n`.
 */
const LENGTH_NAMES = new Set(["n", "m", "size", "count", "length", "len", "total", "rows", "cols"]);

function isPointerName(name: string): boolean {
  if (LENGTH_NAMES.has(name)) return false;
  return POINTER_NAMES.has(name) || /^[a-z]$/.test(name);
}

export interface IndexPointer {
  name: string;
  at: number;
}

/**
 * The cursors that point into `value`: integer locals holding a position that
 * exists in it.
 *
 * One past the end counts, because a half-open right edge is how most loops are
 * written and seeing it sit just off the array is the point.
 */
export function pointersInto(
  value: TraceValue,
  locals: readonly TraceLocal[],
  exclude: string,
): IndexPointer[] {
  if (value.t === "graph" || value.t === "grid") return [];
  const length = valueLength(value);
  if (length === 0) return [];

  const pointers: IndexPointer[] = [];
  for (const local of locals) {
    if (local.name === exclude || local.kind !== "int" || !isPointerName(local.name)) continue;
    const at = Number(local.repr);
    if (!Number.isInteger(at) || at < 0 || at > length) continue;
    pointers.push({ name: local.name, at });
  }
  return pointers;
}
