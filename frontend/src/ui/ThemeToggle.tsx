/**
 * Cycles light → dark → follow the system.
 *
 * "System" is a real option rather than only an initial default: someone whose
 * laptop switches at sunset should not have to switch the app too.
 */

import { nextPreference, setThemePreference, useTheme, useThemePreference, type ThemePreference } from "@/lib/theme";
import { IconButton } from "./IconButton";
import { MonitorIcon, MoonIcon, SunIcon } from "./Icons";

const DESCRIPTION: Record<ThemePreference, string> = {
  light: "Light theme",
  dark: "Dark theme",
  system: "Theme follows your system",
};

export function ThemeToggle() {
  const preference = useThemePreference();
  const resolved = useTheme();
  const next = nextPreference(preference);

  return (
    <IconButton
      label={`${DESCRIPTION[preference]}. Switch to ${DESCRIPTION[next].toLowerCase()}.`}
      title={DESCRIPTION[preference]}
      data-testid="theme-toggle"
      data-theme-preference={preference}
      onClick={() => setThemePreference(next)}
      icon={
        preference === "system" ? <MonitorIcon /> : resolved === "dark" ? <MoonIcon /> : <SunIcon />
      }
    />
  );
}
