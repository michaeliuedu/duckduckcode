/**
 * Test-run results, shared with the room.
 *
 * Like runs and traces, this travels through the room's Yjs metadata, so every
 * field is validated on the way in.
 */

/** A case as the author wrote it. `expected` is any JSON value. */
export interface TestCase {
  name: string;
  /** Arguments spread into the entry point. Always a JSON array. */
  args: unknown[];
  expected: unknown;
  /** Not shown before running. Not secret — see the note in the README. */
  hidden: boolean;
}

export interface TestOutcome {
  index: number;
  passed: boolean;
  /** `repr()` of what the function returned. */
  actual: string;
  stdout: string;
  /** Exception text, or the reason the module never ran. */
  error: string;
}

export interface TestRun {
  status: "running" | "ok" | "error";
  /** Results in case order. Empty while running. */
  outcomes: TestOutcome[];
  /** Set when the code could not be loaded at all, so no case ran. */
  setupError: string;
  by: string;
  at: number;
  durationMs?: number;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asOutcome(raw: unknown): TestOutcome | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Partial<TestOutcome>;
  if (typeof v.index !== "number") return null;
  return {
    index: v.index,
    passed: v.passed === true,
    actual: asString(v.actual),
    stdout: asString(v.stdout),
    error: asString(v.error),
  };
}

export function parseTestRun(raw: unknown): TestRun | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Partial<TestRun>;
  if (v.status !== "running" && v.status !== "ok" && v.status !== "error") return null;
  if (typeof v.by !== "string" || typeof v.at !== "number") return null;
  const run: TestRun = {
    status: v.status,
    outcomes: Array.isArray(v.outcomes) ? v.outcomes.map(asOutcome).filter((x): x is TestOutcome => x !== null) : [],
    setupError: asString(v.setupError),
    by: v.by,
    at: v.at,
  };
  if (typeof v.durationMs === "number" && Number.isFinite(v.durationMs)) run.durationMs = v.durationMs;
  return run;
}

export interface TestTally {
  passed: number;
  failed: number;
  total: number;
  /** Every case passed and there was at least one. */
  allPassed: boolean;
}

export function tally(run: TestRun | null): TestTally {
  const outcomes = run?.outcomes ?? [];
  const passed = outcomes.filter((outcome) => outcome.passed).length;
  return {
    passed,
    failed: outcomes.length - passed,
    total: outcomes.length,
    allPassed: outcomes.length > 0 && passed === outcomes.length,
  };
}

/** A short label for a case: the author's name, or its position. */
export function caseLabel(testCase: TestCase | undefined, index: number): string {
  const name = testCase?.name?.trim();
  if (name) return name;
  return `Case ${index + 1}`;
}

/** JSON as a person would want to read it in a results table. */
export function formatValue(value: unknown): string {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** The arguments of a case, rendered as a call would look. */
export function formatCall(entryPoint: string, args: unknown[]): string {
  return `${entryPoint}(${args.map(formatValue).join(", ")})`;
}
