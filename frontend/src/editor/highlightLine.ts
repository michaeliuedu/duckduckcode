/**
 * A single highlighted line, used by the visualiser to show where execution is.
 *
 * A state field rather than a class toggled from outside, so the highlight
 * survives — and moves with — edits made by either participant.
 */

import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

/** Sets the highlighted 1-based line, or clears it with `null`. */
export const setHighlightedLine = StateEffect.define<number | null>();

function decorationsFor(line: number | null, state: EditorState): DecorationSet {
  if (line === null || line < 1 || line > state.doc.lines) return Decoration.none;
  return Decoration.set([Decoration.line({ class: "cm-traceLine" }).range(state.doc.line(line).from)]);
}

const highlightedLine = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setHighlightedLine)) return decorationsFor(effect.value, transaction.state);
    }
    return transaction.docChanged ? decorations.map(transaction.changes) : decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function highlightLineExtension() {
  return highlightedLine;
}

/** Highlights a line and scrolls it into view without stealing focus. */
export function revealLine(view: EditorView, line: number | null): void {
  const effects: StateEffect<unknown>[] = [setHighlightedLine.of(line)];
  if (line !== null && line >= 1 && line <= view.state.doc.lines) {
    effects.push(EditorView.scrollIntoView(view.state.doc.line(line).from, { y: "center", yMargin: 48 }));
  }
  view.dispatch({ effects });
}
