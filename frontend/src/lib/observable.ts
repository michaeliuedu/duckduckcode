/**
 * A tiny observable value.
 *
 * Theme, identity and layout are all "one browser-wide value that several
 * components read and any of them may change". Each one used to grow its own
 * module-level `Set` of listeners; this is that pattern once, in a shape
 * `useSyncExternalStore` consumes directly.
 */

import { useSyncExternalStore } from "react";

export interface Observable<T> {
  get(): T;
  set(next: T): void;
  update(recipe: (previous: T) => T): void;
  subscribe(listener: () => void): () => void;
}

export interface ObservableOptions<T> {
  /** Called after every change that actually changed the value. */
  onChange?: (value: T) => void;
  /** Defaults to `Object.is`; override for values compared structurally. */
  equals?: (a: T, b: T) => boolean;
}

export function observable<T>(initial: T | (() => T), options: ObservableOptions<T> = {}): Observable<T> {
  const { onChange, equals = Object.is } = options;
  let loaded = false;
  let value: T;
  const listeners = new Set<() => void>();

  const read = (): T => {
    if (!loaded) {
      value = typeof initial === "function" ? (initial as () => T)() : initial;
      loaded = true;
    }
    return value;
  };

  const write = (next: T): void => {
    if (equals(read(), next)) return;
    value = next;
    onChange?.(next);
    for (const listener of listeners) listener();
  };

  return {
    get: read,
    set: write,
    update: (recipe) => write(recipe(read())),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** Subscribes a component to an observable. */
export function useObservable<T>(store: Observable<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
