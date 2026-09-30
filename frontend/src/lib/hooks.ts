/** Reusable hooks that are not specific to any one feature. */

import { useCallback, useEffect, useInsertionEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { RefCallback } from "react";
import { readString, writeString } from "./storage";

/**
 * A callback with a stable identity that always calls the latest version.
 *
 * Lets effects and event handlers depend on "the current behaviour" without
 * re-running every render, which is what the old editor did by hand with a ref
 * to its whole props object.
 */
export function useEvent<Args extends unknown[], Result>(handler: (...args: Args) => Result): (...args: Args) => Result {
  const ref = useRef(handler);
  useInsertionEffect(() => {
    ref.current = handler;
  });
  return useCallback((...args: Args) => ref.current(...args), []);
}

/** Tracks a CSS media query. */
export function useMediaQuery(query: string): boolean {
  const [subscribe, getSnapshot] = useMemo(() => {
    const list = typeof window === "undefined" || !window.matchMedia ? null : window.matchMedia(query);
    return [
      (onChange: () => void) => {
        list?.addEventListener("change", onChange);
        return () => list?.removeEventListener("change", onChange);
      },
      () => list?.matches ?? false,
    ] as const;
  }, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** True once the viewport is at least Tailwind's `md` breakpoint. */
export function useIsWideViewport(): boolean {
  return useMediaQuery("(min-width: 768px)");
}

/**
 * Copy-to-clipboard with a short-lived "copied" flag, falling back to a
 * hidden-textarea copy where the async clipboard API is unavailable (older
 * browsers, or any insecure origin).
 */
export function useCopyToClipboard(resetAfterMs = 1600): [boolean, (text: string) => Promise<boolean>] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(
    async (text: string) => {
      const ok = await writeToClipboard(text);
      if (!ok) return false;
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), resetAfterMs);
      return true;
    },
    [resetAfterMs],
  );

  return [copied, copy];
}

async function writeToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export interface Hotkey {
  /** e.g. "Mod-Enter", "Mod-Shift-Enter", "?" — matched case-insensitively. */
  combo: string;
  run: () => void;
  /** Fire even while a text field or the editor has focus. Defaults to false. */
  allowInInput?: boolean;
  enabled?: boolean;
}

function comboMatches(combo: string, event: KeyboardEvent): boolean {
  const parts = combo.split("-");
  const key = parts[parts.length - 1]!.toLowerCase();
  const wants = {
    mod: parts.includes("Mod"),
    shift: parts.includes("Shift"),
    alt: parts.includes("Alt"),
  };
  const mod = event.metaKey || event.ctrlKey;
  return (
    event.key.toLowerCase() === key &&
    mod === wants.mod &&
    event.shiftKey === wants.shift &&
    event.altKey === wants.alt
  );
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Window-level keyboard shortcuts. */
export function useHotkeys(hotkeys: readonly Hotkey[]): void {
  const dispatch = useEvent((event: KeyboardEvent) => {
    for (const hotkey of hotkeys) {
      if (hotkey.enabled === false) continue;
      if (!hotkey.allowInInput && isTextEntry(event.target)) continue;
      if (!comboMatches(hotkey.combo, event)) continue;
      event.preventDefault();
      hotkey.run();
      return;
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", dispatch);
    return () => window.removeEventListener("keydown", dispatch);
  }, [dispatch]);
}

/** Measures an element along one axis, staying correct as the window resizes. */
export function useElementSize(axis: "width" | "height"): [RefCallback<HTMLElement>, number] {
  const [size, setSize] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);

  const ref = useCallback<RefCallback<HTMLElement>>(
    (node) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!node) return;
      setSize(axis === "width" ? node.clientWidth : node.clientHeight);
      if (typeof ResizeObserver === "undefined") return;
      const next = new ResizeObserver(([entry]) => {
        if (!entry) return;
        const box = entry.contentRect;
        setSize(axis === "width" ? box.width : box.height);
      });
      next.observe(node);
      observer.current = next;
    },
    [axis],
  );

  useEffect(() => () => observer.current?.disconnect(), []);

  return [ref, size];
}

/** A boolean remembered across visits. */
export function usePersistentBoolean(key: string, initial: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => {
    const stored = readString(key);
    return stored === null ? initial : stored === "true";
  });
  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      writeString(key, String(next));
    },
    [key],
  );
  return [value, set];
}
