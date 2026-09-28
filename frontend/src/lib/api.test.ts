import { describe, expect, it } from "vitest";
import { apiUrl, normalizeBase, roomLink, wsServerUrl } from "./api";

describe("normalizeBase", () => {
  it("strips trailing slashes and whitespace", () => {
    expect(normalizeBase(" http://localhost:8080// ")).toBe("http://localhost:8080");
    expect(normalizeBase(undefined)).toBe("");
  });
});

describe("apiUrl", () => {
  it("joins against an explicit backend", () => {
    expect(apiUrl("http://localhost:8080/", "/api/rooms")).toBe("http://localhost:8080/api/rooms");
    expect(apiUrl("http://localhost:8080", "api/rooms")).toBe("http://localhost:8080/api/rooms");
  });
  it("is relative when the backend is same-origin", () => {
    expect(apiUrl("", "/api/rooms")).toBe("/api/rooms");
  });
});

describe("wsServerUrl", () => {
  it("uses the page origin with the matching ws scheme when backend is same-origin", () => {
    expect(wsServerUrl("", "https://code.example.edu")).toBe("wss://code.example.edu/ws/rooms");
    expect(wsServerUrl("", "http://localhost:3000")).toBe("ws://localhost:3000/ws/rooms");
  });
  it("uses the explicit backend when configured", () => {
    expect(wsServerUrl("http://localhost:8080", "http://localhost:3000")).toBe("ws://localhost:8080/ws/rooms");
    expect(wsServerUrl("https://api.example.edu/", "http://localhost:3000")).toBe("wss://api.example.edu/ws/rooms");
  });
});

describe("roomLink", () => {
  it("builds a shareable link on the page origin", () => {
    expect(roomLink("https://code.example.edu/", "abc_DEF-123")).toBe("https://code.example.edu/rooms/abc_DEF-123");
  });
});
