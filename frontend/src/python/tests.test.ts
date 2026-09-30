import { describe, expect, it } from "vitest";
import { caseLabel, formatCall, formatValue, parseTestRun, tally } from "./tests";

const outcome = { index: 0, passed: true, actual: "[]", stdout: "", error: "" };

function run(overrides: Record<string, unknown> = {}) {
  return { status: "ok", outcomes: [outcome], setupError: "", by: "Lin", at: 7, ...overrides };
}

describe("parseTestRun", () => {
  it("accepts a complete run", () => {
    const parsed = parseTestRun(run());
    expect(parsed?.outcomes).toHaveLength(1);
    expect(parsed?.outcomes[0]?.passed).toBe(true);
  });

  it("keeps a duration when one is present", () => {
    expect(parseTestRun(run({ durationMs: 120 }))?.durationMs).toBe(120);
  });

  it("drops malformed outcomes rather than the whole run", () => {
    const parsed = parseTestRun(run({ outcomes: [outcome, { passed: true }, "nope"] }));
    expect(parsed?.outcomes).toHaveLength(1);
  });

  it("treats a missing passed flag as a failure, never a pass", () => {
    const parsed = parseTestRun(run({ outcomes: [{ index: 0 }] }));
    expect(parsed?.outcomes[0]?.passed).toBe(false);
  });

  it("rejects anything that is not a run", () => {
    expect(parseTestRun(null)).toBeNull();
    expect(parseTestRun(run({ status: "idle" }))).toBeNull();
    expect(parseTestRun(run({ by: undefined }))).toBeNull();
    expect(parseTestRun(run({ at: "soon" }))).toBeNull();
  });
});

describe("tally", () => {
  it("counts passes and failures", () => {
    const parsed = parseTestRun(
      run({
        outcomes: [
          { index: 0, passed: true },
          { index: 1, passed: false },
          { index: 2, passed: true },
        ],
      }),
    );
    expect(tally(parsed)).toEqual({ passed: 2, failed: 1, total: 3, allPassed: false });
  });

  it("only reports allPassed when there was something to pass", () => {
    expect(tally(parseTestRun(run({ outcomes: [] })))).toEqual({ passed: 0, failed: 0, total: 0, allPassed: false });
    expect(tally(null).allPassed).toBe(false);
    expect(tally(parseTestRun(run())).allPassed).toBe(true);
  });
});

describe("caseLabel", () => {
  it("prefers the author's name", () => {
    expect(caseLabel({ name: "handles an empty list", args: [], expected: null, hidden: false }, 0)).toBe(
      "handles an empty list",
    );
  });

  it("falls back to the position", () => {
    expect(caseLabel({ name: "   ", args: [], expected: null, hidden: false }, 2)).toBe("Case 3");
    expect(caseLabel(undefined, 0)).toBe("Case 1");
  });
});

describe("formatValue", () => {
  it("renders JSON the way an author wrote it", () => {
    expect(formatValue([1, 2])).toBe("[1,2]");
    expect(formatValue("hi")).toBe('"hi"');
    expect(formatValue(null)).toBe("null");
  });

  it("is empty for undefined, which means no expected value was set", () => {
    expect(formatValue(undefined)).toBe("");
  });
});

describe("formatCall", () => {
  it("reads like the call the harness makes", () => {
    expect(formatCall("flock_sizes", [["DD", ".."]])).toBe('flock_sizes(["DD",".."])');
    expect(formatCall("solve", [1, "two"])).toBe('solve(1, "two")');
  });
});
