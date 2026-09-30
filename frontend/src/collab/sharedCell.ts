/**
 * A single typed value stored in a Yjs map, shaped for React.
 *
 * Every shared value in a room is a JSON string in one `Y.Map`. Decoding on each
 * read would hand `useSyncExternalStore` a new object every time and spin the
 * renderer forever, so the decoded value is cached against the raw string and
 * only recomputed when that string actually changes.
 */

import { useSyncExternalStore } from "react";
import type * as Y from "yjs";

export interface SharedCell<T> {
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}

export interface Codec<T> {
  encode(value: T): string;
  decode(raw: string | undefined): T;
}

/** JSON in, validated value out; anything unparsable decodes to the fallback. */
export function jsonCodec<T>(accept: (raw: unknown) => T | null, fallback: T): Codec<T> {
  return {
    encode: (value) => JSON.stringify(value),
    decode: (raw) => {
      if (typeof raw !== "string") return fallback;
      try {
        return accept(JSON.parse(raw) as unknown) ?? fallback;
      } catch {
        return fallback;
      }
    },
  };
}

export const numberCodec: Codec<number> = {
  encode: (value) => String(value),
  decode: (raw) => {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  },
};

export function sharedCell<T>(map: Y.Map<string>, key: string, codec: Codec<T>): SharedCell<T> {
  let cachedRaw: string | undefined;
  let cachedValue: T;
  let primed = false;

  return {
    get() {
      const raw = map.get(key);
      if (!primed || raw !== cachedRaw) {
        cachedRaw = raw;
        cachedValue = codec.decode(raw);
        primed = true;
      }
      return cachedValue;
    },
    set(value) {
      map.set(key, codec.encode(value));
    },
    subscribe(listener) {
      // One observer per subscriber is cheap: Yjs keeps them in a set, and a room
      // has a handful of cells.
      const observer = () => listener();
      map.observe(observer);
      return () => map.unobserve(observer);
    },
  };
}

/** Subscribes a component to a shared cell. */
export function useSharedCell<T>(cell: SharedCell<T>): T {
  return useSyncExternalStore(cell.subscribe, cell.get, cell.get);
}
