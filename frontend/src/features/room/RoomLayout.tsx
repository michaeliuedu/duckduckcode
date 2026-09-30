/**
 * How the three panes are arranged.
 *
 * On a wide screen: nested resizable splits — problem beside code, console under
 * code — each divider draggable, collapsible and remembered.
 *
 * On a narrow screen: the same three panes as tabs. Two 180px-minimum panes side
 * by side do not fit on a phone, and shrinking them until they technically fit
 * serves nobody; one at a time is the honest answer.
 */

import { useIsWideViewport } from "@/lib/hooks";
import { SplitPane } from "@/ui/split/SplitPane";
import { Tabs, TabPanel, type TabDefinition } from "@/ui/Tabs";
import { ConsolePanel, type ConsoleTab } from "./ConsolePanel";
import { EditorPanel } from "./EditorPanel";
import { ProblemPanel } from "./ProblemPanel";
import { useRoom } from "./RoomContext";
import { SPLIT_CONSOLE, SPLIT_PROBLEM, type RoomLayout as LayoutState } from "./useRoomLayout";
import type { Runner } from "./useRunner";

/** Wide-screen defaults, in fractions of the available space. */
const DEFAULT_PROBLEM_FRACTION = 0.36;
const DEFAULT_EDITOR_FRACTION = 0.62;

const MIN_PROBLEM_WIDTH = 240;
const MIN_CODE_WIDTH = 360;
const MIN_EDITOR_HEIGHT = 140;
const MIN_CONSOLE_HEIGHT = 120;

/** Which pane fills a narrow screen. Ignored on a wide one, where all three show. */
export type WorkspacePane = "problem" | "code" | "console";

export interface RoomLayoutProps {
  layout: LayoutState;
  runner: Runner;
  consoleTab: ConsoleTab;
  onConsoleTab: (tab: ConsoleTab) => void;
  pane: WorkspacePane;
  onPane: (pane: WorkspacePane) => void;
}

export function RoomLayout(props: RoomLayoutProps) {
  const wide = useIsWideViewport();
  return wide ? <WideLayout {...props} /> : <NarrowLayout {...props} />;
}

function WideLayout({ layout, runner, consoleTab, onConsoleTab }: RoomLayoutProps) {
  const { problem } = useRoom();

  const codeAndConsole = (
    <SplitPane
      // Remounted when the layout is reset, so the cleared size is picked up.
      key={`console-${layout.version}`}
      direction="vertical"
      storageKey={SPLIT_CONSOLE}
      defaultFraction={DEFAULT_EDITOR_FRACTION}
      minFirst={MIN_EDITOR_HEIGHT}
      minSecond={MIN_CONSOLE_HEIGHT}
      collapsed={layout.consoleCollapsed ? "second" : null}
      labels={["Code", "Console"]}
      testId="split-console"
      className="flex-1"
      first={<EditorPanel runner={runner} />}
      second={<ConsolePanel runner={runner} tab={consoleTab} onTab={onConsoleTab} />}
    />
  );

  if (!problem) {
    return <div className="flex min-h-0 flex-1 flex-col p-2">{codeAndConsole}</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-2">
      <SplitPane
        key={`problem-${layout.version}`}
        direction="horizontal"
        storageKey={SPLIT_PROBLEM}
        defaultFraction={DEFAULT_PROBLEM_FRACTION}
        minFirst={MIN_PROBLEM_WIDTH}
        minSecond={MIN_CODE_WIDTH}
        collapsed={layout.problemCollapsed ? "first" : null}
        labels={["Problem", "Code"]}
        testId="split-problem"
        className="flex-1"
        first={<ProblemPanel problem={problem} />}
        second={codeAndConsole}
      />
    </div>
  );
}

function NarrowLayout({ runner, consoleTab, onConsoleTab, pane, onPane }: RoomLayoutProps) {
  const { problem } = useRoom();

  const problemTab: TabDefinition<WorkspacePane> = { id: "problem", label: "Problem", testId: "narrow-tab-problem" };
  const tabs: TabDefinition<WorkspacePane>[] = [
    ...(problem ? [problemTab] : []),
    { id: "code", label: "Code", testId: "narrow-tab-code" },
    { id: "console", label: "Console", testId: "narrow-tab-console" },
  ];
  // With no problem pane there is nothing to show for "problem".
  const active: WorkspacePane = pane === "problem" && !problem ? "code" : pane;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
      <Tabs label="Workspace pane" value={active} onChange={onPane} tabs={tabs} className="shrink-0 px-1" />
      {problem && (
        <TabPanel id="problem" active={active === "problem"}>
          <ProblemPanel problem={problem} />
        </TabPanel>
      )}
      <TabPanel id="code" active={active === "code"}>
        <EditorPanel runner={runner} />
      </TabPanel>
      <TabPanel id="console" active={active === "console"}>
        <ConsolePanel runner={runner} tab={consoleTab} onTab={onConsoleTab} />
      </TabPanel>
    </div>
  );
}
