/**
 * Remote carets and selections.
 *
 * This replaces `yRemoteSelections` from y-codemirror.next while keeping its
 * `ySync` binding, which does the actual CRDT work. Two reasons to own the
 * presentation:
 *
 *  1. The library's caret widget compares itself to the next one by colour
 *     alone, so CodeMirror reuses the existing DOM when only the name changed —
 *     and a participant who renames themselves keeps their old label on the
 *     other person's screen for the rest of the session. Comparing the name too
 *     fixes it.
 *  2. The library hides the name until you hover the caret. In a two-person
 *     room, who is where is the thing you want to see without hunting for it, so
 *     labels are always visible here.
 *
 * The position logic follows the original: relative positions travel through
 * awareness, and each side resolves them against its own copy of the document.
 */

import { Annotation, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";

/** Forces a decoration rebuild when awareness changes but the document did not. */
const awarenessChanged = Annotation.define<null>();

/** The payload y-protocols emits with its "change" event. */
interface AwarenessChange {
  added: number[];
  updated: number[];
  removed: number[];
}

interface RemoteUser {
  name: string;
  color: string;
  colorLight: string;
}

function readUser(state: unknown): RemoteUser {
  const user = (state as { user?: Partial<RemoteUser> } | undefined)?.user;
  const color = typeof user?.color === "string" ? user.color : "#30bced";
  return {
    name: typeof user?.name === "string" ? user.name : "Anonymous",
    color,
    colorLight: typeof user?.colorLight === "string" ? user.colorLight : `${color}33`,
  };
}

interface AwarenessCursor {
  anchor: unknown;
  head: unknown;
}

function readCursor(state: unknown): AwarenessCursor | null {
  const cursor = (state as { cursor?: Partial<AwarenessCursor> } | undefined)?.cursor;
  if (!cursor || cursor.anchor == null || cursor.head == null) return null;
  return { anchor: cursor.anchor, head: cursor.head };
}

class RemoteCaret extends WidgetType {
  constructor(
    private readonly color: string,
    private readonly name: string,
  ) {
    super();
  }

  // Both fields, so a rename replaces the rendered label.
  override eq(other: RemoteCaret): boolean {
    return other.color === this.color && other.name === this.name;
  }

  override toDOM(): HTMLElement {
    const caret = document.createElement("span");
    caret.className = "cm-ySelectionCaret";
    caret.style.backgroundColor = this.color;
    caret.style.borderColor = this.color;

    const dot = document.createElement("div");
    dot.className = "cm-ySelectionCaretDot";

    const label = document.createElement("div");
    label.className = "cm-ySelectionInfo";
    label.textContent = this.name;

    // The word-joiners keep the caret from being absorbed into an adjacent
    // text node, which would make it disappear at the end of a line.
    caret.append("⁠", dot, "⁠", label, "⁠");
    return caret;
  }

  override updateDOM(): boolean {
    return false;
  }

  override get estimatedHeight(): number {
    return -1;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

/**
 * Publishes where this editor's caret is, so the other side can draw it.
 * Positions are relative, so they survive concurrent edits elsewhere.
 */
function publishLocalCursor(update: ViewUpdate, ytext: Y.Text, awareness: Awareness): void {
  const local = awareness.getLocalState();
  if (local == null) return;

  const focused = update.view.hasFocus && update.view.dom.ownerDocument.hasFocus();
  if (!focused) return;

  const selection = update.state.selection.main;
  const anchor = Y.createRelativePositionFromTypeIndex(ytext, selection.anchor);
  const head = Y.createRelativePositionFromTypeIndex(ytext, selection.head);

  const current = readCursor(local);
  if (current) {
    const sameAnchor = Y.compareRelativePositions(Y.createRelativePositionFromJSON(current.anchor), anchor);
    const sameHead = Y.compareRelativePositions(Y.createRelativePositionFromJSON(current.head), head);
    if (sameAnchor && sameHead) return;
  }
  awareness.setLocalStateField("cursor", { anchor, head });
}

function selectionDecorations(
  update: ViewUpdate,
  ytext: Y.Text,
  awareness: Awareness,
): { from: number; to: number; value: Decoration }[] {
  const doc = ytext.doc;
  if (!doc) return [];
  const decorations: { from: number; to: number; value: Decoration }[] = [];

  awareness.getStates().forEach((state, clientId) => {
    if (clientId === awareness.doc.clientID) return;
    const cursor = readCursor(state);
    if (!cursor) return;

    const anchor = Y.createAbsolutePositionFromRelativePosition(cursor.anchor as Y.RelativePosition, doc);
    const head = Y.createAbsolutePositionFromRelativePosition(cursor.head as Y.RelativePosition, doc);
    // A position can fail to resolve while the two documents are still
    // converging, or point at a different shared type entirely.
    if (anchor == null || head == null || anchor.type !== ytext || head.type !== ytext) return;

    const { name, color, colorLight } = readUser(state);
    const start = Math.min(anchor.index, head.index);
    const end = Math.max(anchor.index, head.index);
    const startLine = update.state.doc.lineAt(start);
    const endLine = update.state.doc.lineAt(end);
    const highlight = () =>
      Decoration.mark({ attributes: { style: `background-color: ${colorLight}` }, class: "cm-ySelection" });

    if (startLine.number === endLine.number) {
      if (start !== end) decorations.push({ from: start, to: end, value: highlight() });
    } else {
      decorations.push({ from: start, to: startLine.to, value: highlight() });
      decorations.push({ from: endLine.from, to: end, value: highlight() });
      for (let line = startLine.number + 1; line < endLine.number; line++) {
        const at = update.state.doc.line(line).from;
        decorations.push({
          from: at,
          to: at,
          value: Decoration.line({
            attributes: { style: `background-color: ${colorLight}`, class: "cm-yLineSelection" },
          }),
        });
      }
    }

    decorations.push({
      from: head.index,
      to: head.index,
      value: Decoration.widget({
        // Keep the caret outside the highlighted range it belongs to.
        side: head.index - anchor.index > 0 ? -1 : 1,
        block: false,
        widget: new RemoteCaret(color, name),
      }),
    });
  });

  return decorations;
}

/** Caret, selection and always-visible name label styling. */
export const remoteCursorsTheme = EditorView.baseTheme({
  ".cm-yLineSelection": {
    padding: 0,
    margin: "0px 2px 0px 4px",
  },
  ".cm-ySelectionCaret": {
    position: "relative",
    display: "inline",
    boxSizing: "border-box",
    marginLeft: "-1px",
    marginRight: "-1px",
    borderLeft: "1px solid black",
    borderRight: "1px solid black",
  },
  ".cm-ySelectionCaretDot": {
    position: "absolute",
    top: "-.2em",
    left: "-.2em",
    width: ".4em",
    height: ".4em",
    borderRadius: "50%",
    backgroundColor: "inherit",
    boxSizing: "border-box",
    transition: "transform .2s ease-in-out",
  },
  ".cm-ySelectionCaret:hover > .cm-ySelectionCaretDot": {
    transformOrigin: "bottom center",
    transform: "scale(0)",
  },
  ".cm-ySelectionInfo": {
    position: "absolute",
    top: "-1.15em",
    left: "-1px",
    zIndex: 101,
    padding: "0 4px",
    borderRadius: "3px 3px 3px 0",
    backgroundColor: "inherit",
    color: "#ffffff",
    fontFamily: "var(--font-ui)",
    fontSize: "10px",
    fontStyle: "normal",
    fontWeight: "500",
    lineHeight: "1.5",
    whiteSpace: "nowrap",
    userSelect: "none",
  },
});

/**
 * Renders everyone else's caret and selection, and publishes this editor's own.
 * Pair with `ySync` from y-codemirror.next, not with `yCollab`.
 */
export function remoteCursors(ytext: Y.Text, awareness: Awareness): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;
      private readonly onAwareness: (change: AwarenessChange) => void;

      constructor(view: EditorView) {
        // Awareness changes do not touch the document, so nothing would ask the
        // plugin to recompute; this empty transaction does.
        //
        // Only *other* clients may trigger it. Publishing our own cursor happens
        // inside `update()`, and dispatching from the listener it fires would be
        // a dispatch during an update, which CodeMirror rejects outright.
        this.onAwareness = ({ added, updated, removed }: AwarenessChange) => {
          const touched = [...added, ...updated, ...removed];
          if (touched.some((clientId) => clientId !== awareness.doc.clientID)) {
            view.dispatch({ annotations: [awarenessChanged.of(null)] });
          }
        };
        awareness.on("change", this.onAwareness);
      }

      destroy() {
        awareness.off("change", this.onAwareness);
      }

      update(update: ViewUpdate) {
        publishLocalCursor(update, ytext, awareness);
        this.decorations = Decoration.set(selectionDecorations(update, ytext, awareness), true);
      }
    },
    { decorations: (value) => value.decorations },
  );

  return [remoteCursorsTheme, plugin];
}
