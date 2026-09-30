import { describe, expect, it } from "vitest";
import { resolveConfig } from "./config";

describe("resolveConfig", () => {
  it("prefers the build-time override", () => {
    expect(resolveConfig({ VITE_BACKEND_URL: "http://localhost:8080" }, { backendUrl: "https://ignored" })).toEqual({
      backendUrl: "http://localhost:8080",
    });
  });

  it("falls back to the injected runtime value", () => {
    expect(resolveConfig({}, { backendUrl: "https://api.example.edu/" })).toEqual({
      backendUrl: "https://api.example.edu",
    });
  });

  it("means same-origin when neither is set or the value is junk", () => {
    expect(resolveConfig({}, undefined)).toEqual({ backendUrl: "" });
    expect(resolveConfig({ VITE_BACKEND_URL: "  " }, { backendUrl: 7 })).toEqual({ backendUrl: "" });
  });
});
