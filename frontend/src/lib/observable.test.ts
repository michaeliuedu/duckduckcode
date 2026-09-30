import { describe, expect, it, vi } from "vitest";
import { observable } from "./observable";

describe("observable", () => {
  it("holds a value and reports changes", () => {
    const store = observable(1);
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(2);
    expect(store.get()).toBe(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when the value did not change", () => {
    const store = observable("a");
    const listener = vi.fn();
    store.subscribe(listener);

    store.set("a");
    expect(listener).not.toHaveBeenCalled();
  });

  it("uses a custom comparison when given one", () => {
    const store = observable({ n: 1 }, { equals: (a, b) => a.n === b.n });
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({ n: 1 });
    expect(listener).not.toHaveBeenCalled();
    store.set({ n: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("defers a lazy initial value until first read", () => {
    const initial = vi.fn(() => 5);
    const store = observable(initial);
    expect(initial).not.toHaveBeenCalled();
    expect(store.get()).toBe(5);
    expect(store.get()).toBe(5);
    expect(initial).toHaveBeenCalledTimes(1);
  });

  it("calls onChange only for real changes", () => {
    const onChange = vi.fn();
    const store = observable<number>(0, { onChange });
    store.set(0);
    store.set(1);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("updates from the previous value", () => {
    const store = observable(10);
    store.update((previous) => previous + 5);
    expect(store.get()).toBe(15);
  });

  it("stops notifying after unsubscribe", () => {
    const store = observable(0);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.set(1);
    expect(listener).not.toHaveBeenCalled();
  });
});
