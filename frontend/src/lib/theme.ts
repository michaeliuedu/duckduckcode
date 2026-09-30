/**
 * Colour theme: an explicit light/dark choice, or "system" to follow the OS.
 *
 * The resolved theme is expressed as a `light` or `dark` class on <html>, which
 * is what the CSS custom properties in index.css key off. index.html applies the
 * same class before first paint — keep STORAGE_KEY and the class contract in
 * sync with the inline script there.
 */

import { observable, useObservable } from "./observable";
import { readString, writeString } from "./storage";

export type ThemePreference = "light" | "dark" | "system";
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "duckduckcode.theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function resolveTheme(preference: ThemePreference, system: Theme = systemTheme()): Theme {
  return preference === "system" ? system : preference;
}

function readPreference(): ThemePreference {
  const stored = readString(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.style.colorScheme = theme;
}

const preferenceStore = observable<ThemePreference>(readPreference, {
  onChange: (preference) => {
    // "system" is stored as the absence of a preference so a fresh profile and
    // a deliberate reset behave identically.
    writeString(THEME_STORAGE_KEY, preference === "system" ? "" : preference);
    applyTheme(resolveTheme(preference));
  },
});

const systemStore = observable<Theme>(systemTheme);

if (typeof window !== "undefined" && window.matchMedia) {
  window.matchMedia(DARK_QUERY).addEventListener("change", (event) => {
    systemStore.set(event.matches ? "dark" : "light");
    if (preferenceStore.get() === "system") applyTheme(resolveTheme("system", systemStore.get()));
  });
}

/** The next preference in the light → dark → system cycle. */
export function nextPreference(current: ThemePreference): ThemePreference {
  return current === "light" ? "dark" : current === "dark" ? "system" : "light";
}

export function setThemePreference(preference: ThemePreference): void {
  preferenceStore.set(preference);
}

export function useThemePreference(): ThemePreference {
  return useObservable(preferenceStore);
}

/** The theme actually in effect, following the OS when the preference is "system". */
export function useTheme(): Theme {
  return resolveTheme(useObservable(preferenceStore), useObservable(systemStore));
}
