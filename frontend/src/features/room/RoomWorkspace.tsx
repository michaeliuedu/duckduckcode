/**
 * Everything inside a connected room.
 *
 * Owns the state the panes share — the layout, which console tab is open, which
 * pane fills a narrow screen, and the runner — plus the keyboard shortcuts that
 * reach them from anywhere on the page.
 */

import { useCallback, useEffect, useState } from "react";
import { useHotkeys, useIsWideViewport } from "@/lib/hooks";
import type { ConsoleTab } from "./ConsolePanel";
import { RoomHeader } from "./RoomHeader";
import { RoomLayout, type WorkspacePane } from "./RoomLayout";
import { useRoom } from "./RoomContext";
import { useRoomLayout } from "./useRoomLayout";
import { useRunner, type RunnerActivity } from "./useRunner";

export function RoomWorkspace() {
  const { problem, session } = useRoom();
  const layout = useRoomLayout();
  const wide = useIsWideViewport();
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>("output");
  const [pane, setPane] = useState<WorkspacePane>("code");

  const onRunStart = useCallback(
    (kind: Exclude<RunnerActivity, null>) => {
      // Show the thing you just asked to see: output for a plain run, the
      // visualiser for a trace, the results for a test run. Pressing Ctrl-Enter
      // while the Tests tab is open used to run the code and leave you looking
      // at the last test run, which reads as nothing having happened.
      if (kind === "run") setConsoleTab("output");
      if (kind === "trace") setConsoleTab("visualize");
      if (kind === "test") setConsoleTab("tests");
      // And make sure the console is actually on screen: the pane it lives in
      // on a narrow screen, and the collapsed split on a wide one.
      setPane("console");
      layout.showConsole();
    },
    [layout],
  );

  const runner = useRunner(session, {
    onStart: onRunStart,
    entryPoint: problem?.entryPoint,
    testCases: problem?.tests,
    problemId: problem?.id,
  });

  // A trace started by the other person is worth switching to as well — that is
  // the point of sharing it. Driven by the document's own change notification,
  // which is what an effect is for.
  useEffect(
    () =>
      session.shared.trace.subscribe(() => {
        if (session.shared.trace.get()?.status === "running") setConsoleTab("visualize");
      }),
    [session],
  );
  useEffect(
    () =>
      session.shared.tests.subscribe(() => {
        if (session.shared.tests.get()?.status === "running") setConsoleTab("tests");
      }),
    [session],
  );

  const stepping = consoleTab === "visualize" && (runner.trace?.steps.length ?? 0) > 0;

  useHotkeys([
    { combo: "Mod-Enter", run: runner.runCode, enabled: runner.activity === null },
    {
      combo: "Mod-Alt-Enter",
      run: runner.runTests,
      enabled: runner.activity === null && runner.testCases.length > 0,
    },
    { combo: "Mod-Shift-Enter", run: runner.visualizeCode, enabled: runner.activity === null },
    // Alt rather than a bare arrow key, so stepping works while the caret is in
    // the editor instead of fighting with it.
    { combo: "Alt-ArrowLeft", run: () => runner.setStep(runner.step - 1), allowInInput: true, enabled: stepping },
    { combo: "Alt-ArrowRight", run: () => runner.setStep(runner.step + 1), allowInInput: true, enabled: stepping },
    { combo: "Mod-b", run: layout.toggleProblem, allowInInput: true, enabled: wide },
    { combo: "Mod-j", run: layout.toggleConsole, allowInInput: true, enabled: wide },
  ]);

  return (
    <div className="flex h-dvh flex-col bg-[var(--canvas)]">
      <RoomHeader layout={layout} showLayoutControls={wide} />
      {runner.pythonError && <PythonUnavailable message={runner.pythonError} />}
      <RoomLayout
        layout={layout}
        runner={runner}
        consoleTab={consoleTab}
        onConsoleTab={setConsoleTab}
        pane={pane}
        onPane={setPane}
      />
    </div>
  );
}

/**
 * Pyodide comes from a CDN, so a blocked network or a locked-down browser is a
 * real possibility. Editing together still works, and saying so is better than a
 * Run button that silently does nothing.
 */
function PythonUnavailable({ message }: { message: string }) {
  return (
    <div
      role="status"
      data-testid="python-unavailable"
      className="shrink-0 border-b border-[var(--line)] bg-[var(--chip)] px-4 py-1.5 text-[12px] text-[var(--ink-soft)]"
    >
      <strong className="font-semibold text-[var(--error)]">Python is unavailable.</strong> {message} Editing together is
      unaffected.
    </div>
  );
}
