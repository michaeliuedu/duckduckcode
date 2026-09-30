import { describe, expect, it, vi } from "vitest";
import { memoryStore, readJson, readString, writeJson, writeString, type KeyValueStore } from "./storage";

/** A store that refuses every operation, like a browser with storage blocked. */
const hostile: KeyValueStore = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("readString / writeString", () => {
  it("round-trips through a store", () => {
    const store = memoryStore();
    writeString("k", "v", store);
    expect(readString("k", store)).toBe("v");
  });

  it("reports a missing key as null", () => {
    expect(readString("absent", memoryStore())).toBeNull();
  });

  it("never throws when the browser refuses", () => {
    expect(() => writeString("k", "v", hostile)).not.toThrow();
    expect(readString("k", hostile)).toBeNull();
  });
});

describe("readJson / writeJson", () => {
  const accept = (raw: unknown) => (typeof raw === "object" && raw !== null && "n" in raw ? (raw as { n: number }) : null);

  it("round-trips a value through the validator", () => {
    const store = memoryStore();
    writeJson("k", { n: 3 }, store);
    expect(readJson("k", accept, store)).toEqual({ n: 3 });
  });

  it("returns null for unparsable JSON", () => {
    const store = memoryStore({ k: "{oops" });
    expect(readJson("k", accept, store)).toBeNull();
  });

  it("returns null when the validator rejects the value", () => {
    const store = memoryStore({ k: '{"other":1}' });
    expect(readJson("k", accept, store)).toBeNull();
  });

  it("does not throw on a value that cannot be serialised", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const store = memoryStore();
    expect(() => writeJson("k", circular, store)).not.toThrow();
  });
});

describe("memoryStore", () => {
  it("behaves like a Storage for the operations we use", () => {
    const store = memoryStore({ a: "1" });
    expect(store.getItem("a")).toBe("1");
    store.setItem("a", "2");
    expect(store.getItem("a")).toBe("2");
    store.removeItem("a");
    expect(store.getItem("a")).toBeNull();
  });
});

describe("a failing validator", () => {
  it("is treated as a rejected value, not a crash", () => {
    const store = memoryStore({ k: "{}" });
    const thrower = vi.fn(() => {
      throw new Error("bad shape");
    });
    expect(readJson("k", thrower, store)).toBeNull();
  });
});
