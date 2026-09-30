/**
 * A keyboard-navigable tab strip.
 *
 * Follows the ARIA tabs pattern: one tab in the tab order, arrow keys move
 * between them, Home/End jump to the ends. Used both for the console's
 * Output/Visualize switch and for the whole room layout on a narrow screen.
 */

import { useRef, type ReactNode } from "react";

export interface TabDefinition<Id extends string> {
  id: Id;
  label: ReactNode;
  /** Trailing content, e.g. a status dot or a count. */
  trailing?: ReactNode;
  testId?: string;
  disabled?: boolean;
}

export interface TabsProps<Id extends string> {
  /** Names the tab strip for assistive technology. */
  label: string;
  value: Id;
  onChange: (id: Id) => void;
  tabs: readonly TabDefinition<Id>[];
  className?: string;
}

export function Tabs<Id extends string>({ label, value, onChange, tabs, className = "" }: TabsProps<Id>) {
  const strip = useRef<HTMLDivElement | null>(null);

  const move = (delta: number | "first" | "last") => {
    const enabled = tabs.filter((tab) => !tab.disabled);
    if (enabled.length === 0) return;
    if (delta === "first") return onChange(enabled[0]!.id);
    if (delta === "last") return onChange(enabled[enabled.length - 1]!.id);
    const index = enabled.findIndex((tab) => tab.id === value);
    const next = enabled[(index + delta + enabled.length) % enabled.length]!;
    onChange(next.id);
    // Keep focus with the selection, as the tabs pattern expects.
    strip.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${next.id}"]`)?.focus();
  };

  return (
    <div ref={strip} role="tablist" aria-label={label} className={`flex items-center gap-1 ${className}`.trim()}>
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            disabled={tab.disabled}
            data-tab-id={tab.id}
            data-testid={tab.testId}
            className={selected ? "tab tab-active" : "tab tab-idle"}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              const keys: Record<string, () => void> = {
                ArrowRight: () => move(1),
                ArrowDown: () => move(1),
                ArrowLeft: () => move(-1),
                ArrowUp: () => move(-1),
                Home: () => move("first"),
                End: () => move("last"),
              };
              const action = keys[event.key];
              if (!action) return;
              event.preventDefault();
              action();
            }}
          >
            {tab.label}
            {tab.trailing}
          </button>
        );
      })}
    </div>
  );
}

/** The region a tab controls. Hidden panels stay mounted so state survives. */
export function TabPanel({
  id,
  active,
  children,
  className = "",
}: {
  id: string;
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${id}`}
      aria-labelledby={`tab-${id}`}
      hidden={!active}
      className={active ? `flex min-h-0 min-w-0 flex-1 flex-col ${className}`.trim() : "hidden"}
    >
      {children}
    </div>
  );
}
