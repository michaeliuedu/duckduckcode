import { describe, expect, it } from "vitest";
import {
  changedCells,
  changedLocals,
  clampStepIndex,
  frameLabel,
  MAX_VALUE_CELLS,
  parseTraceResult,
  pointersInto,
  type TraceLocal,
} from "./trace";

const step = {
  line: 3,
  event: "line",
  fn: "<module>",
  locals: [{ name: "n", repr: "1", kind: "int" }],
  stack: [{ fn: "<module>", line: 3 }],
  stdout: "",
};

function result(overrides: Record<string, unknown> = {}) {
  return { status: "ok", source: "n = 1", steps: [step], stdout: "", stderr: "", truncated: false, by: "Lin", at: 7, ...overrides };
}

describe("parseTraceResult", () => {
  it("accepts a complete trace", () => {
    const parsed = parseTraceResult(result());
    expect(parsed?.steps).toHaveLength(1);
    expect(parsed?.steps[0]?.locals[0]?.name).toBe("n");
  });

  it("accepts the older `return` field name for a return value", () => {
    const parsed = parseTraceResult(result({ steps: [{ ...step, event: "return", return: "42" }] }));
    expect(parsed?.steps[0]?.returnValue).toBe("42");
  });

  it("drops individual malformed steps rather than the whole trace", () => {
    const parsed = parseTraceResult(result({ steps: [step, { line: "three" }, { ...step, event: "call" }] }));
    expect(parsed?.steps).toHaveLength(1);
  });

  it("drops malformed locals and frames inside an otherwise valid step", () => {
    const parsed = parseTraceResult(
      result({ steps: [{ ...step, locals: [{ name: "n" }, step.locals[0]], stack: [{ fn: 1 }] }] }),
    );
    expect(parsed?.steps[0]?.locals).toHaveLength(1);
    expect(parsed?.steps[0]?.stack).toHaveLength(0);
  });

  it("rejects anything missing the fields that identify a trace", () => {
    expect(parseTraceResult(null)).toBeNull();
    expect(parseTraceResult(result({ status: "idle" }))).toBeNull();
    expect(parseTraceResult(result({ source: undefined }))).toBeNull();
    expect(parseTraceResult(result({ by: undefined }))).toBeNull();
  });
});

describe("clampStepIndex", () => {
  it("keeps an index inside the trace", () => {
    expect(clampStepIndex(5, 10)).toBe(5);
    expect(clampStepIndex(99, 10)).toBe(9);
    expect(clampStepIndex(-4, 10)).toBe(0);
  });

  it("accepts the string form the shared map stores", () => {
    expect(clampStepIndex("3", 10)).toBe(3);
  });

  it("is zero for an empty trace or an unusable value", () => {
    expect(clampStepIndex(4, 0)).toBe(0);
    expect(clampStepIndex("later", 10)).toBe(0);
    expect(clampStepIndex(null, 10)).toBe(0);
  });
});

describe("changedLocals", () => {
  const before: TraceLocal[] = [
    { name: "n", repr: "1", kind: "int" },
    { name: "items", repr: "[]", kind: "list" },
  ];

  it("reports only the names whose value differs", () => {
    const after: TraceLocal[] = [
      { name: "n", repr: "1", kind: "int" },
      { name: "items", repr: "[1]", kind: "list" },
    ];
    expect([...changedLocals(after, before)]).toEqual(["items"]);
  });

  it("treats a brand-new name as changed", () => {
    const after: TraceLocal[] = [...before, { name: "total", repr: "0", kind: "int" }];
    expect([...changedLocals(after, before)]).toEqual(["total"]);
  });

  it("highlights nothing on the very first step", () => {
    expect(changedLocals(before, []).size).toBe(0);
  });
});

describe("frameLabel", () => {
  it("names the module frame after the file", () => {
    expect(frameLabel("<module>")).toBe("main.py");
    expect(frameLabel("solve")).toBe("solve");
  });
});

describe("structured values off the wire", () => {
  function withValue(value: unknown) {
    const parsed = parseTraceResult(
      result({ steps: [{ ...step, locals: [{ name: "xs", repr: "[1, 2]", kind: "list", value }] }] }),
    );
    return parsed?.steps[0]?.locals[0];
  }

  it("keeps a well-formed sequence", () => {
    const local = withValue({ t: "seq", kind: "list", items: ["1", "2"], n: 2 });
    expect(local?.value).toEqual({ t: "seq", kind: "list", items: ["1", "2"], n: 2 });
  });

  it("keeps the true length when only some cells were sent", () => {
    const local = withValue({ t: "seq", kind: "list", items: ["1"], n: 900 });
    expect(local?.value?.t === "seq" && local.value.n).toBe(900);
  });

  it("keeps a mapping, a grid and a graph", () => {
    expect(withValue({ t: "map", kind: "dict", entries: [["'a'", "1"]], n: 1 })?.value?.t).toBe("map");
    expect(withValue({ t: "grid", kind: "list", rows: [["1", "2"], ["3", "4"]] })?.value?.t).toBe("grid");
    expect(withValue({ t: "graph", nodes: ["0", "1"], edges: [["0", "1"]] })?.value?.t).toBe("graph");
  });

  // The trace arrives from the other person's browser, so none of this is trusted.
  it("drops a value it cannot trust, keeping the repr", () => {
    const cases: unknown[] = [
      { t: "seq", kind: "list", items: ["1", 2], n: 2 },
      { t: "seq", kind: "list", items: ["1"], n: 0 },
      { t: "seq", items: ["1"], n: 1 },
      { t: "map", kind: "dict", entries: [["'a'"]], n: 1 },
      { t: "grid", kind: "list", rows: [["1", "2"], ["3"]] },
      { t: "graph", nodes: ["0"], edges: [["0", "7"]] },
      { t: "nonsense" },
      "not an object",
      null,
    ];
    for (const value of cases) {
      const local = withValue(value);
      expect(local?.value, JSON.stringify(value)).toBeUndefined();
      expect(local?.repr).toBe("[1, 2]");
    }
  });

  it("refuses a container larger than the cap, rather than truncating it here", () => {
    const items = Array.from({ length: MAX_VALUE_CELLS + 1 }, (_, i) => String(i));
    expect(withValue({ t: "seq", kind: "list", items, n: items.length })?.value).toBeUndefined();
  });
});

describe("changedCells", () => {
  const seq = (items: string[]) => ({ t: "seq" as const, kind: "list", items, n: items.length });

  it("reports the positions that were written", () => {
    expect([...changedCells(seq(["1", "9", "3"]), seq(["1", "2", "3"]))]).toEqual([1]);
  });

  it("reports the new tail when something was appended", () => {
    expect([...changedCells(seq(["1", "2", "3"]), seq(["1", "2"]))]).toEqual([2]);
  });

  it("reports a new key in a mapping, which keeps insertion order", () => {
    const pairs = (entries: [string, string][]) => ({ t: "map" as const, kind: "dict", entries, n: entries.length });
    const before = pairs([["'a'", "1"]]);
    const after = pairs([["'a'", "1"], ["'b'", "2"]]);
    expect([...changedCells(after, before)]).toEqual([1]);
  });

  it("reports nothing when the contents moved rather than grew", () => {
    expect(changedCells(seq(["9", "1", "2"]), seq(["1", "2"])).size).toBe(0);
    expect(changedCells(seq(["1"]), seq(["1", "2"])).size).toBe(0);
  });

  it("compares a mapping by key and value together", () => {
    const before = { t: "map" as const, kind: "dict", entries: [["'a'", "1"]] as [string, string][], n: 1 };
    const after = { t: "map" as const, kind: "dict", entries: [["'a'", "2"]] as [string, string][], n: 1 };
    expect([...changedCells(after, before)]).toEqual([0]);
  });

  it("reports nothing when there is no previous step", () => {
    expect(changedCells(seq(["1"]), undefined).size).toBe(0);
  });
});

describe("pointersInto", () => {
  const xs = { t: "seq" as const, kind: "list", items: ["a", "b", "c"], n: 3 };

  it("finds the conventional index names", () => {
    const locals: TraceLocal[] = [
      { name: "i", repr: "0", kind: "int" },
      { name: "right", repr: "2", kind: "int" },
    ];
    expect(pointersInto(xs, locals, "xs")).toEqual([
      { name: "i", at: 0 },
      { name: "right", at: 2 },
    ]);
  });

  it("allows one past the end, which is where a half-open edge lives", () => {
    expect(pointersInto(xs, [{ name: "j", repr: "3", kind: "int" }], "xs")).toEqual([{ name: "j", at: 3 }]);
  });

  it("ignores an index that could not address this value", () => {
    const locals: TraceLocal[] = [
      { name: "i", repr: "4", kind: "int" },
      { name: "j", repr: "-1", kind: "int" },
    ];
    expect(pointersInto(xs, locals, "xs")).toEqual([]);
  });

  it("ignores names that are lengths rather than positions, and non-integers", () => {
    const locals: TraceLocal[] = [
      { name: "n", repr: "2", kind: "int" },
      { name: "count", repr: "2", kind: "int" },
      { name: "total", repr: "2", kind: "int" },
      { name: "i", repr: "1.5", kind: "float" },
    ];
    expect(pointersInto(xs, locals, "xs")).toEqual([]);
  });

  it("never points a value at itself", () => {
    expect(pointersInto(xs, [{ name: "xs", repr: "1", kind: "int" }], "xs")).toEqual([]);
  });

  it("has nothing to point at on a graph or an empty sequence", () => {
    const locals: TraceLocal[] = [{ name: "i", repr: "0", kind: "int" }];
    expect(pointersInto({ t: "graph", nodes: ["0"], edges: [["0", "0"]] }, locals, "g")).toEqual([]);
    expect(pointersInto({ t: "seq", kind: "list", items: [], n: 0 }, locals, "xs")).toEqual([]);
  });
});
