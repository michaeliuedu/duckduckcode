import { describe, expect, it } from "vitest";
import { acceptParticipant, MAX_NAME_LENGTH, PALETTE, randomParticipant, sanitizeName, selectionColor } from "./participant";

describe("selectionColor", () => {
  it("turns a caret colour into a translucent selection colour", () => {
    expect(selectionColor("#f97316")).toBe("rgba(249, 115, 22, 0.25)");
    expect(selectionColor("f97316")).toBe("rgba(249, 115, 22, 0.25)");
  });

  it("expands the three-digit form", () => {
    expect(selectionColor("#0f8")).toBe("rgba(0, 255, 136, 0.25)");
  });

  it("honours a custom alpha", () => {
    expect(selectionColor("#000000", 0.5)).toBe("rgba(0, 0, 0, 0.5)");
  });

  it("falls back to grey for anything unparsable", () => {
    expect(selectionColor("tomato")).toBe("rgba(125, 125, 125, 0.25)");
  });
});

describe("sanitizeName", () => {
  it("trims and collapses whitespace", () => {
    expect(sanitizeName("  Curious   Duck  ")).toBe("Curious Duck");
  });

  it("caps the length", () => {
    expect(sanitizeName("x".repeat(80))).toHaveLength(MAX_NAME_LENGTH);
  });

  it("rejects a name with nothing in it", () => {
    expect(sanitizeName("   ")).toBeNull();
    expect(sanitizeName("")).toBeNull();
  });
});

describe("acceptParticipant", () => {
  it("accepts a stored identity", () => {
    expect(acceptParticipant({ name: "Lin", color: "#22c55e" })).toEqual({ name: "Lin", color: "#22c55e" });
  });

  it("ignores extra fields from older builds", () => {
    expect(acceptParticipant({ name: "Lin", color: "#22c55e", colorLight: "rgba(0,0,0,0.2)" })).toEqual({
      name: "Lin",
      color: "#22c55e",
    });
  });

  it("repairs a colour it cannot use", () => {
    expect(acceptParticipant({ name: "Lin", color: "chartreuse" })?.color).toBe(PALETTE[0]);
  });

  it("rejects anything without a usable name", () => {
    expect(acceptParticipant(null)).toBeNull();
    expect(acceptParticipant({ color: "#fff" })).toBeNull();
    expect(acceptParticipant({ name: "   ", color: "#fff" })).toBeNull();
    expect(acceptParticipant("Lin")).toBeNull();
  });
});

describe("randomParticipant", () => {
  it("produces a two-word name and a palette colour", () => {
    for (let i = 0; i < 25; i++) {
      const participant = randomParticipant();
      expect(participant.name.split(" ")).toHaveLength(2);
      expect(PALETTE).toContain(participant.color);
    }
  });
});
