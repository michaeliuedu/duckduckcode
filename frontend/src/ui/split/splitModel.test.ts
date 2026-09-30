import { describe, expect, it } from "vitest";
import {
  acceptFraction,
  clampFraction,
  contentSize,
  firstPaneSize,
  fractionBounds,
  fractionFromPosition,
  hasRoomForBoth,
  nudgeFraction,
  separatorValue,
  type SplitConstraints,
} from "./splitModel";

/** 1000px of space, an 8px divider, and both panes needing at least 200px. */
const roomy: SplitConstraints = { total: 1008, minFirst: 200, minSecond: 200, dividerSize: 8 };
/** Too small for both minimums. */
const cramped: SplitConstraints = { total: 308, minFirst: 200, minSecond: 200, dividerSize: 8 };

describe("contentSize", () => {
  it("excludes the divider and never goes negative", () => {
    expect(contentSize(roomy)).toBe(1000);
    expect(contentSize({ ...roomy, total: 4 })).toBe(0);
  });
});

describe("hasRoomForBoth", () => {
  it("is true only once both minimums fit", () => {
    expect(hasRoomForBoth(roomy)).toBe(true);
    expect(hasRoomForBoth(cramped)).toBe(false);
  });
});

describe("fractionBounds", () => {
  it("derives the draggable range from the pixel minimums", () => {
    expect(fractionBounds(roomy)).toEqual({ min: 0.2, max: 0.8 });
  });
});

describe("clampFraction", () => {
  it("keeps a reasonable fraction untouched", () => {
    expect(clampFraction(0.5, roomy)).toBe(0.5);
  });

  it("pulls a fraction back inside the minimums", () => {
    expect(clampFraction(0.02, roomy)).toBe(0.2);
    expect(clampFraction(0.99, roomy)).toBe(0.8);
  });

  it("never leaves 0..1", () => {
    expect(clampFraction(-3, roomy)).toBe(0.2);
    expect(clampFraction(12, roomy)).toBe(0.8);
  });

  it("falls back to the midpoint for values that are not numbers", () => {
    expect(clampFraction(Number.NaN, roomy)).toBe(0.5);
    expect(clampFraction(Number.POSITIVE_INFINITY, roomy)).toBe(0.5);
  });

  it("shares proportionally when neither minimum can be honoured", () => {
    // Both want 200px of 300px: an even split is the least bad answer.
    expect(clampFraction(0.9, cramped)).toBeCloseTo(0.5, 5);
  });

  it("tolerates a container that has not been measured yet", () => {
    expect(clampFraction(0.3, { ...roomy, total: 0 })).toBe(0.3);
  });
});

describe("firstPaneSize", () => {
  it("converts to whole pixels", () => {
    expect(firstPaneSize(0.5, roomy)).toBe(500);
    expect(firstPaneSize(0.2001, roomy)).toBe(200);
  });

  it("respects the minimums", () => {
    expect(firstPaneSize(0.01, roomy)).toBe(200);
    expect(firstPaneSize(1, roomy)).toBe(800);
  });
});

describe("fractionFromPosition", () => {
  it("centres the divider under the pointer", () => {
    // Pointer at 504px: the first pane ends at 500px, half a divider earlier.
    expect(fractionFromPosition(504, roomy)).toBeCloseTo(0.5, 5);
  });

  it("clamps a pointer dragged past either end", () => {
    expect(fractionFromPosition(-40, roomy)).toBe(0.2);
    expect(fractionFromPosition(5000, roomy)).toBe(0.8);
  });
});

describe("nudgeFraction", () => {
  it("moves by a pixel amount", () => {
    expect(nudgeFraction(0.5, 24, roomy)).toBeCloseTo(0.524, 5);
    expect(nudgeFraction(0.5, -24, roomy)).toBeCloseTo(0.476, 5);
  });

  it("stops at the bounds instead of overshooting", () => {
    expect(nudgeFraction(0.21, -96, roomy)).toBe(0.2);
    expect(nudgeFraction(0.79, 96, roomy)).toBe(0.8);
  });
});

describe("separatorValue", () => {
  it("reports a whole percentage for aria-valuenow", () => {
    expect(separatorValue(0.362, roomy)).toBe(36);
  });
});

describe("acceptFraction", () => {
  it("accepts a stored fraction, as a number or a string", () => {
    expect(acceptFraction(0.42)).toBe(0.42);
    expect(acceptFraction("0.42")).toBe(0.42);
  });

  it("rejects values that would collapse a pane or make no sense", () => {
    expect(acceptFraction(0)).toBeNull();
    expect(acceptFraction(1)).toBeNull();
    expect(acceptFraction(-0.5)).toBeNull();
    expect(acceptFraction("")).toBeNull();
    expect(acceptFraction("nope")).toBeNull();
    expect(acceptFraction(null)).toBeNull();
    expect(acceptFraction({})).toBeNull();
  });
});
