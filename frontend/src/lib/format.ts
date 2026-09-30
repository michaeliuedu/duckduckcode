/** Small presentation helpers, kept out of components so they can be tested. */

/** Up to two uppercase initials for an avatar. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

/** A short wall-clock time, e.g. "4:07 PM". */
export function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** "1.2s", "340ms" — durations in the unit that reads best. */
export function duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

/** How a language identifier from the API is shown in the UI. */
export function languageLabel(language: string): string {
  if (language === "python") return "Python 3";
  return language.charAt(0).toUpperCase() + language.slice(1);
}

/** True on Apple platforms, so shortcut hints can show ⌘ instead of Ctrl. */
export function isAppleDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

/** Renders a shortcut like "Mod-Enter" for the current platform. */
export function shortcutLabel(keys: string, apple = isAppleDevice()): string {
  return keys
    .split("-")
    .map((key) => {
      if (key === "Mod") return apple ? "⌘" : "Ctrl";
      if (key === "Shift") return apple ? "⇧" : "Shift";
      if (key === "Alt") return apple ? "⌥" : "Alt";
      if (key === "Enter") return apple ? "↩" : "Enter";
      return key;
    })
    .join(apple ? "" : "+");
}

/** "1 test", "4 tests" — a count with the right plural. */
export function pluralizeCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
