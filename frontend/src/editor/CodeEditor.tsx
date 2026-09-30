/**
 * The CodeMirror view, as a React component.
 *
 * A thin, declarative wrapper: the editor is created once for a session and then
 * only reconfigured — theme through a compartment, highlighted line through an
 * effect. Callbacks arrive through `useEvent` so changing a handler never
 * rebuilds the editor.
 */

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { RoomSession } from "@/collab/session";
import { useEvent } from "@/lib/hooks";
import type { Theme } from "@/lib/theme";
import { editorExtensions } from "./extensions";
import { revealLine } from "./highlightLine";
import { editorAppearance, editorThemeCompartment } from "./theme";

export interface CodeEditorProps {
  session: RoomSession;
  theme: Theme;
  /** 1-based line to highlight and scroll to, or `null` for none. */
  highlightedLine: number | null;
  onRun: () => void;
  onVisualize: () => void;
  placeholder?: string;
  className?: string;
}

export function CodeEditor({
  session,
  theme,
  highlightedLine,
  onRun,
  onVisualize,
  placeholder = "Write Python here. Ctrl/⌘ Enter runs it.",
  className,
}: CodeEditorProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);

  const run = useEvent(onRun);
  const visualize = useEvent(onVisualize);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;

    const created = new EditorView({
      parent,
      state: EditorState.create({
        // yCollab reconciles the document with the shared text on attach; seeding
        // with the current value avoids a visible empty frame.
        doc: session.getSource(),
        extensions: editorExtensions({
          session,
          theme,
          onRun: run,
          onVisualize: visualize,
          emptyPlaceholder: placeholder,
        }),
      }),
    });
    view.current = created;

    return () => {
      view.current = null;
      created.destroy();
    };
    // `theme` and `placeholder` are applied by reconfiguration below, not by
    // rebuilding the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, run, visualize]);

  useEffect(() => {
    view.current?.dispatch({ effects: editorThemeCompartment.reconfigure(editorAppearance(theme)) });
  }, [theme]);

  useEffect(() => {
    const current = view.current;
    if (current) revealLine(current, highlightedLine);
  }, [highlightedLine]);

  return <div ref={host} className={className} />;
}

export default CodeEditor;
