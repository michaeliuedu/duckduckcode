/**
 * The bottom pane: program output, or the step-by-step visualiser.
 *
 * Both tabs stay mounted so switching between them keeps the visualiser's scroll
 * position and does not disturb the shared step pointer.
 */

import { clockTime, duration } from "@/lib/format";
import { Badge } from "@/ui/Badge";
import { BarActions, Panel, PanelBar } from "@/ui/Panel";
import { Tabs, TabPanel, type TabDefinition } from "@/ui/Tabs";
import { OutputView } from "./OutputView";
import { TestsBadge, TestsView } from "./TestsView";
import { VisualizePanel } from "./VisualizePanel";
import type { Runner } from "./useRunner";

export type ConsoleTab = "output" | "tests" | "visualize";

export interface ConsolePanelProps {
  runner: Runner;
  tab: ConsoleTab;
  onTab: (tab: ConsoleTab) => void;
}

function tabsFor(runner: Runner): TabDefinition<ConsoleTab>[] {
  return [
    { id: "output", label: "Output", testId: "output-tab" },
    // Only offered when the problem actually has cases; an empty tab is a
    // dead end.
    ...(runner.testCases.length > 0
      ? [{ id: "tests" as const, label: "Tests", testId: "tests-tab" }]
      : []),
    { id: "visualize", label: "Visualize", testId: "visualize-tab" },
  ];
}

export function ConsolePanel({ runner, tab, onTab }: ConsolePanelProps) {
  return (
    <Panel testId="console-panel" label="Output and visualiser">
      <PanelBar>
        <Tabs label="Console view" value={tab} onChange={onTab} tabs={tabsFor(runner)} />
        {tab === "tests" ? <TestsBadge runner={runner} /> : <ResultBadge runner={runner} />}
        <BarActions>
          <Timing runner={runner} />
        </BarActions>
      </PanelBar>

      <TabPanel id="output" active={tab === "output"}>
        <OutputView runner={runner} />
      </TabPanel>
      <TabPanel id="tests" active={tab === "tests"}>
        <TestsView runner={runner} />
      </TabPanel>
      <TabPanel id="visualize" active={tab === "visualize"}>
        <VisualizePanel runner={runner} />
      </TabPanel>
    </Panel>
  );
}

/** One badge summarising the last result, or nothing if nothing has run. */
function ResultBadge({ runner }: { runner: Runner }) {
  if (runner.activity === "run") return <Badge tone="brand">Running</Badge>;
  if (runner.activity === "trace") return <Badge tone="brand">Tracing</Badge>;
  if (runner.activity === "test") return <Badge tone="brand">Testing</Badge>;
  if (runner.pythonStatus === "failed") return <Badge tone="error">Python unavailable</Badge>;

  const result = runner.run;
  if (!result) return null;
  if (result.status === "running") return <Badge tone="neutral">{result.by} is running</Badge>;
  if (result.status === "error") return <Badge tone="error">Error · {result.by}</Badge>;
  return <Badge tone="ok">Finished · {result.by}</Badge>;
}

function Timing({ runner }: { runner: Runner }) {
  const result = runner.run;
  if (runner.activity !== null || !result || result.status === "running") return null;
  return (
    <span className="pr-1 text-[12px] text-[var(--muted)]">
      {result.durationMs !== undefined && <span className="mr-2">{duration(result.durationMs)}</span>}
      <span className="hidden sm:inline">{clockTime(result.at)}</span>
    </span>
  );
}
