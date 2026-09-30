import { describe, expect, it } from "vitest";
import { nextPreference, resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("uses an explicit preference whatever the system says", () => {
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
  });

  it("follows the system when the preference is to follow it", () => {
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("system", "light")).toBe("light");
  });
});

describe("nextPreference", () => {
  it("cycles light → dark → system and back", () => {
    expect(nextPreference("light")).toBe("dark");
    expect(nextPreference("dark")).toBe("system");
    expect(nextPreference("system")).toBe("light");
  });
});
