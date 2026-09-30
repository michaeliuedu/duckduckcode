import { describe, expect, it } from "vitest";
import { isEmptyRun, parseRunResult } from "./run";

describe("parseRunResult", () => {
  it("accepts a complete result", () => {
    expect(parseRunResult({ status: "ok", stdout: "hi\n", stderr: "", by: "Lin", at: 1 })).toEqual({
      status: "ok",
      stdout: "hi\n",
      stderr: "",
      by: "Lin",
      at: 1,
    });
  });

  it("keeps a duration when one is present", () => {
    expect(parseRunResult({ status: "ok", by: "Lin", at: 1, durationMs: 340 })?.durationMs).toBe(340);
  });

  it("repairs missing output fields rather than rejecting the result", () => {
    expect(parseRunResult({ status: "error", by: "Lin", at: 1 })).toEqual({
      status: "error",
      stdout: "",
      stderr: "",
      by: "Lin",
      at: 1,
    });
  });

  it("rejects anything that is not a result", () => {
    expect(parseRunResult(null)).toBeNull();
    expect(parseRunResult("nope")).toBeNull();
    expect(parseRunResult({ status: "idle", by: "Lin", at: 1 })).toBeNull();
    expect(parseRunResult({ status: "ok", by: "Lin" })).toBeNull();
    expect(parseRunResult({ status: "ok", at: 1 })).toBeNull();
  });

  it("drops a duration that is not a finite number", () => {
    expect(parseRunResult({ status: "ok", by: "Lin", at: 1, durationMs: "fast" })?.durationMs).toBeUndefined();
    expect(parseRunResult({ status: "ok", by: "Lin", at: 1, durationMs: Number.NaN })?.durationMs).toBeUndefined();
  });
});

describe("isEmptyRun", () => {
  it("is true only when nothing was printed at all", () => {
    expect(isEmptyRun({ status: "ok", stdout: "", stderr: "", by: "a", at: 0 })).toBe(true);
    expect(isEmptyRun({ status: "ok", stdout: "x", stderr: "", by: "a", at: 0 })).toBe(false);
    expect(isEmptyRun({ status: "error", stdout: "", stderr: "boom", by: "a", at: 0 })).toBe(false);
  });
});
