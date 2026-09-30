/**
 * The code pane: the shared editor plus the controls that act on it.
 *
 * Run turns into Stop while something is executing here, so a loop that never
 * ends is recoverable without reloading the page.
 */

import { useConnectionState } from "@/collab/useRoomSession";
import { CodeEditor } from "@/editor/CodeEditor";
import { languageLabel, shortcutLabel } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { BeakerIcon, PlayIcon, StepsIcon, StopIcon } from "@/ui/Icons";
import { BarActions, Panel, PanelBar, PanelFileName } from "@/ui/Panel";
import { useRoom } from "./RoomContext";
import type { Runner } from "./useRunner";

export interface EditorPanelProps {
  runner: Runner;
}

export function EditorPanel({ runner }: EditorPanelProps) {
  const { room, session } = useRoom();
  const connection = useConnectionState(session);
  const theme = useTheme();
  const running = runner.activity !== null;

  return (
    <Panel testId="editor-panel" label="Shared code">
      <PanelBar>
        <span className="tab tab-active">Code</span>
        <Badge tone="neutral">{languageLabel(room.language)}</Badge>
        <PanelFileName>main.py</PanelFileName>
        <EditorStatus runner={runner} syncing={connection.status === "connected" && !connection.synced} />
        <BarActions>
          <span className="hidden font-mono text-[11px] text-[var(--muted)] lg:inline">{shortcutLabel("Mod-Enter")}</span>
          {runner.testCases.length > 0 && (
            <Button
              variant="ghost"
              icon={<BeakerIcon size={13} />}
              onClick={runner.runTests}
              disabled={running}
              data-testid="test-button"
              title={`Check main.py against the ${runner.testCases.length} test cases`}
            >
              Test
            </Button>
          )}
          <Button
            variant="ghost"
            icon={<StepsIcon size={13} />}
            onClick={runner.visualizeCode}
            disabled={running}
            data-testid="visualize-button"
            title={`Step through main.py and watch the variables (${shortcutLabel("Mod-Shift-Enter")})`}
          >
            <span className="hidden sm:inline">Visualize</span>
          </Button>
          {running ? (
            <Button
              variant="danger"
              icon={<StopIcon />}
              onClick={runner.stop}
              data-testid="stop-button"
              title="Stop the interpreter"
            >
              Stop
            </Button>
          ) : (
            <Button
              variant="run"
              icon={<PlayIcon />}
              onClick={runner.runCode}
              data-testid="run-button"
              title={`Run main.py (${shortcutLabel("Mod-Enter")})`}
            >
              Run
            </Button>
          )}
        </BarActions>
      </PanelBar>

      <div className="min-h-0 flex-1 bg-[var(--panel)]">
        <CodeEditor
          session={session}
          theme={theme}
          highlightedLine={runner.currentLine}
          onRun={runner.runCode}
          onVisualize={runner.visualizeCode}
          className="h-full min-h-0"
        />
      </div>
    </Panel>
  );
}

/** A single line of "what the editor is doing right now", or nothing. */
function EditorStatus({ runner, syncing }: { runner: Runner; syncing: boolean }) {
  if (runner.activity === "trace") return <Note tone="brand">Tracing…</Note>;
  if (runner.activity === "test") return <Note tone="brand">Testing…</Note>;
  if (runner.activity === "run") return <Note tone="brand">Running…</Note>;
  if (runner.pythonStatus === "failed") return <Note tone="error">Python unavailable</Note>;
  if (runner.pythonStatus === "loading") return <Note tone="muted">Loading Python…</Note>;
  if (syncing) return <Note tone="muted">Syncing…</Note>;
  return null;
}

function Note({ tone, children }: { tone: "muted" | "brand" | "error"; children: string }) {
  const color = tone === "brand" ? "text-[var(--brand)]" : tone === "error" ? "text-[var(--error)]" : "text-[var(--muted)]";
  return <span className={`hidden shrink-0 text-[12px] md:inline ${color}`}>{children}</span>;
}
