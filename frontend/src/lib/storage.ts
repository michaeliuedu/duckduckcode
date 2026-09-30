/**
 * localStorage that never throws.
 *
 * Private-browsing modes and blocked third-party storage make every access a
 * potential exception, and every value we keep is a preference the app can live
 * without. The backend is the only source of truth for anything that matters.
 *
 * The storage object is injectable so the persistence logic is testable without
 * a DOM.
 */

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** An in-memory store, used as the fallback when the browser refuses access. */
export function memoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function detectStore(): KeyValueStore {
  try {
    const probe = "__duckduckcode_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return memoryStore();
  }
}

let cached: KeyValueStore | null = null;

/** The best available store for this browser, detected once. */
export function browserStore(): KeyValueStore {
  if (cached) return cached;
  cached = typeof window === "undefined" ? memoryStore() : detectStore();
  return cached;
}

export function readString(key: string, store: KeyValueStore = browserStore()): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string, store: KeyValueStore = browserStore()): void {
  try {
    store.setItem(key, value);
  } catch {
    /* preference is then per-page-load */
  }
}

/** Reads JSON, returning `null` for missing, unparsable or rejected values. */
export function readJson<T>(key: string, accept: (raw: unknown) => T | null, store: KeyValueStore = browserStore()): T | null {
  const raw = readString(key, store);
  if (raw === null) return null;
  try {
    return accept(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown, store: KeyValueStore = browserStore()): void {
  try {
    writeString(key, JSON.stringify(value), store);
  } catch {
    /* unserialisable values are a programming error, not a runtime concern */
  }
}
