/**
 * The editor's extension set, in one place.
 *
 * Collected here rather than inline in the component so the "what the editor can
 * do" list is readable on its own, and so the keymap and the buttons in the
 * toolbar can be described by the same shortcut names.
 */

import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput, indentUnit } from "@codemirror/language";
import { python } from "@codemirror/lang-python";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import type { Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
  rectangularSelection,
} from "@codemirror/view";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import type { RoomSession } from "@/collab/session";
import type { Theme } from "@/lib/theme";
import { pythonCompletion } from "./completions";
import { highlightLineExtension } from "./highlightLine";
import { remoteCursors } from "./remoteCursors";
import { editorAppearance, editorThemeCompartment } from "./theme";

export interface EditorExtensionOptions {
  session: RoomSession;
  theme: Theme;
  /** Ctrl/⌘ Enter. */
  onRun: () => void;
  /** Ctrl/⌘ ⇧ Enter. */
  onVisualize: () => void;
  emptyPlaceholder: string;
}

export function editorExtensions({ session, theme, onRun, onVisualize, emptyPlaceholder }: EditorExtensionOptions): Extension[] {
  const command = (action: () => void) => () => {
    action();
    return true;
  };

  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    drawSelection(),
    rectangularSelection(),
    bracketMatching(),
    closeBrackets(),
    autocompletion({ override: [pythonCompletion], activateOnTyping: true, closeOnBlur: true }),
    indentOnInput(),
    indentUnit.of("    "),
    python(),
    // Long lines wrap rather than scroll sideways, which matters once the editor
    // pane can be dragged narrow.
    EditorView.lineWrapping,
    placeholder(emptyPlaceholder),
    search({ top: true }),
    highlightSelectionMatches(),
    // No `history()` extension: Yjs's UndoManager owns undo/redo for the shared
    // text, and two histories over one document undo each other's work.
    editorThemeCompartment.of(editorAppearance(theme)),
    keymap.of([
      { key: "Mod-Enter", run: command(onRun) },
      { key: "Mod-Shift-Enter", run: command(onVisualize) },
      ...closeBracketsKeymap,
      ...completionKeymap,
      ...searchKeymap,
      ...yUndoManagerKeymap,
      ...defaultKeymap,
      indentWithTab,
    ]),
    // `yCollab` with no awareness gives us the document binding and the undo
    // manager but not its remote-selection rendering, which we replace — see
    // the note at the top of remoteCursors.ts.
    yCollab(session.text, null, { undoManager: session.undoManager }),
    remoteCursors(session.text, session.awareness),
    highlightLineExtension(),
    EditorView.contentAttributes.of({
      "aria-label": "Shared code editor",
      "data-testid": "editor",
    }),
  ];
}
