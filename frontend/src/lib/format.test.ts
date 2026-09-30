import { describe, expect, it } from "vitest";
import { clockTime, duration, initials, languageLabel, shortcutLabel } from "./format";

describe("initials", () => {
  it("takes the first letter of up to two words", () => {
    expect(initials("Curious Duck")).toBe("CD");
    expect(initials("madeline")).toBe("M");
    expect(initials("  a  b  c ")).toBe("AB");
  });

  it("is empty for an empty name", () => {
    expect(initials("   ")).toBe("");
  });
});

describe("duration", () => {
  it("switches from milliseconds to seconds", () => {
    expect(duration(340)).toBe("340ms");
    expect(duration(1_240)).toBe("1.2s");
    expect(duration(64_000)).toBe("64s");
  });
});

describe("shortcutLabel", () => {
  it("uses Ctrl and plus signs away from Apple platforms", () => {
    expect(shortcutLabel("Mod-Enter", false)).toBe("Ctrl+Enter");
    expect(shortcutLabel("Mod-Shift-Enter", false)).toBe("Ctrl+Shift+Enter");
  });

  it("uses glyphs with no separators on Apple platforms", () => {
    expect(shortcutLabel("Mod-Enter", true)).toBe("⌘↩");
    expect(shortcutLabel("Mod-Shift-Enter", true)).toBe("⌘⇧↩");
  });
});

describe("clockTime", () => {
  it("formats a timestamp without throwing", () => {
    expect(typeof clockTime(Date.now())).toBe("string");
  });
});

describe("languageLabel", () => {
  it("names Python by its major version, the way the editor shows it", () => {
    expect(languageLabel("python")).toBe("Python 3");
  });

  it("capitalises anything else the backend might add", () => {
    expect(languageLabel("javascript")).toBe("Javascript");
  });
});
