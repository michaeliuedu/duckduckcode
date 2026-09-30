import { describe, expect, it } from "vitest";
import { apiUrl, normalizeBase, roomLink, roomPath, wsServerUrl } from "./urls";

describe("normalizeBase", () => {
  it("strips whitespace and trailing slashes", () => {
    expect(normalizeBase(" http://localhost:8080// ")).toBe("http://localhost:8080");
  });

  it("treats anything that is not a string as same-origin", () => {
    expect(normalizeBase(undefined)).toBe("");
    expect(normalizeBase(null)).toBe("");
    expect(normalizeBase(42)).toBe("");
  });
});

describe("apiUrl", () => {
  it("joins against an explicit backend regardless of slashes", () => {
    expect(apiUrl("http://localhost:8080/", "/api/rooms")).toBe("http://localhost:8080/api/rooms");
    expect(apiUrl("http://localhost:8080", "api/rooms")).toBe("http://localhost:8080/api/rooms");
  });

  it("stays relative when the backend is same-origin", () => {
    expect(apiUrl("", "/api/rooms")).toBe("/api/rooms");
  });
});

describe("wsServerUrl", () => {
  it("follows the page's scheme when the backend is same-origin", () => {
    expect(wsServerUrl("", "https://code.example.edu")).toBe("wss://code.example.edu/ws/rooms");
    expect(wsServerUrl("", "http://localhost:5173")).toBe("ws://localhost:5173/ws/rooms");
  });

  it("uses the configured backend when there is one", () => {
    expect(wsServerUrl("http://localhost:8080", "http://localhost:5173")).toBe("ws://localhost:8080/ws/rooms");
    expect(wsServerUrl("https://api.example.edu/", "http://localhost:5173")).toBe("wss://api.example.edu/ws/rooms");
  });

  it("discards any path, query or fragment on the base", () => {
    expect(wsServerUrl("https://api.example.edu/base?x=1#y", "http://localhost")).toBe("wss://api.example.edu/ws/rooms");
  });
});

describe("room links", () => {
  it("builds a path and an absolute link", () => {
    expect(roomPath("abc_DEF-123")).toBe("/rooms/abc_DEF-123");
    expect(roomLink("https://code.example.edu/", "abc_DEF-123")).toBe("https://code.example.edu/rooms/abc_DEF-123");
  });

  it("encodes ids that are not URL-safe", () => {
    expect(roomPath("a b/c")).toBe("/rooms/a%20b%2Fc");
  });
});
