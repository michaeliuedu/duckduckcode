/**
 * CodeMirror appearance for each app theme.
 *
 * The chrome (background, gutters, selection, tooltips) and the syntax colours
 * are described as data so light and dark stay structurally identical and only
 * the values differ. Swapped at runtime through a compartment, so toggling the
 * theme never rebuilds the editor state.
 */

import { Compartment, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Theme } from "@/lib/theme";

export const editorThemeCompartment = new Compartment();

interface Chrome {
  dark: boolean;
  background: string;
  foreground: string;
  muted: string;
  gutter: string;
  border: string;
  selection: string;
  activeLine: string;
  matchingBracket: string;
  searchMatch: string;
  caret: string;
  tooltipBackground: string;
  tooltipBorder: string;
}

interface Syntax {
  comment: string;
  keyword: string;
  operator: string;
  string: string;
  number: string;
  literal: string;
  functionName: string;
  variable: string;
  definition: string;
  typeName: string;
  property: string;
  punctuation: string;
  meta: string;
  invalid: string;
}

function chromeTheme(c: Chrome): Extension {
  return EditorView.theme(
    {
      "&": { backgroundColor: c.background, color: c.foreground, height: "100%", fontSize: "13px" },
      ".cm-scroller": {
        fontFamily: "var(--font-mono)",
        lineHeight: "1.6",
      },
      ".cm-content": { caretColor: c.caret, padding: "8px 0 40vh" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: c.caret, borderLeftWidth: "2px" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: c.selection,
      },
      ".cm-activeLine": { backgroundColor: c.activeLine },
      ".cm-activeLineGutter": { backgroundColor: c.activeLine, color: c.foreground },
      ".cm-gutters": {
        backgroundColor: c.gutter,
        color: c.muted,
        border: "none",
        borderRight: `1px solid ${c.border}`,
      },
      ".cm-lineNumbers .cm-gutterElement": { minWidth: "2.4rem", padding: "0 8px 0 6px" },
      "&.cm-focused .cm-matchingBracket, .cm-matchingBracket": {
        backgroundColor: c.matchingBracket,
        outline: "none",
      },
      ".cm-selectionMatch": { backgroundColor: c.searchMatch },
      ".cm-searchMatch": { backgroundColor: c.searchMatch, outline: `1px solid ${c.border}` },
      ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: c.selection },
      ".cm-panels": { backgroundColor: c.tooltipBackground, color: c.foreground },
      ".cm-panels.cm-panels-bottom": { borderTop: `1px solid ${c.border}` },
      ".cm-panel.cm-search input, .cm-panel.cm-search button": {
        fontFamily: "var(--font-sans)",
        fontSize: "12px",
      },
      ".cm-tooltip": { backgroundColor: c.tooltipBackground, border: `1px solid ${c.tooltipBorder}`, color: c.foreground },
      ".cm-tooltip-autocomplete": { backgroundColor: c.tooltipBackground, border: `1px solid ${c.tooltipBorder}` },
      ".cm-tooltip-autocomplete > ul": { fontFamily: "var(--font-mono)", fontSize: "12px", maxHeight: "16em" },
      ".cm-tooltip-autocomplete > ul > li": { padding: "3px 8px" },
      ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: c.selection, color: c.foreground },
      ".cm-completionDetail": { color: c.muted, fontStyle: "normal", marginLeft: "0.75em" },
      ".cm-placeholder": { color: c.muted, fontStyle: "normal" },
    },
    { dark: c.dark },
  );
}

function syntaxTheme(s: Syntax): Extension {
  return syntaxHighlighting(
    HighlightStyle.define([
      { tag: t.comment, color: s.comment, fontStyle: "italic" },
      { tag: t.keyword, color: s.keyword },
      { tag: t.operator, color: s.operator },
      { tag: t.string, color: s.string },
      { tag: t.special(t.string), color: s.string },
      { tag: t.number, color: s.number },
      { tag: t.bool, color: s.literal },
      { tag: t.null, color: s.literal },
      { tag: t.self, color: s.literal },
      { tag: t.function(t.variableName), color: s.functionName },
      { tag: t.function(t.definition(t.variableName)), color: s.functionName },
      { tag: t.definition(t.variableName), color: s.definition },
      { tag: t.variableName, color: s.variable },
      { tag: t.className, color: s.typeName },
      { tag: t.typeName, color: s.typeName },
      { tag: t.propertyName, color: s.property },
      { tag: t.punctuation, color: s.punctuation },
      { tag: t.meta, color: s.meta },
      { tag: t.invalid, color: s.invalid },
    ]),
  );
}

const DARK: { chrome: Chrome; syntax: Syntax } = {
  chrome: {
    dark: true,
    background: "#1e1e1e",
    foreground: "#d4d4d4",
    muted: "#858585",
    gutter: "#1e1e1e",
    border: "#2d2d2d",
    selection: "rgba(38, 79, 120, 0.55)",
    activeLine: "rgba(255, 255, 255, 0.04)",
    matchingBracket: "rgba(88, 166, 255, 0.28)",
    searchMatch: "rgba(234, 179, 8, 0.22)",
    caret: "#aeafad",
    tooltipBackground: "#252526",
    tooltipBorder: "#3c3c3c",
  },
  syntax: {
    comment: "#6a9955",
    keyword: "#c586c0",
    operator: "#d4d4d4",
    string: "#ce9178",
    number: "#b5cea8",
    literal: "#569cd6",
    functionName: "#dcdcaa",
    variable: "#9cdcfe",
    definition: "#9cdcfe",
    typeName: "#4ec9b0",
    property: "#9cdcfe",
    punctuation: "#d4d4d4",
    meta: "#808080",
    invalid: "#f44747",
  },
};

const LIGHT: { chrome: Chrome; syntax: Syntax } = {
  chrome: {
    dark: false,
    background: "#ffffff",
    foreground: "#24292e",
    muted: "#8c959f",
    gutter: "#f6f8fa",
    border: "#eaeef2",
    selection: "rgba(84, 174, 255, 0.28)",
    activeLine: "rgba(234, 238, 242, 0.7)",
    matchingBracket: "rgba(9, 105, 218, 0.16)",
    searchMatch: "rgba(255, 213, 79, 0.45)",
    caret: "#0969da",
    tooltipBackground: "#ffffff",
    tooltipBorder: "#d0d7de",
  },
  syntax: {
    comment: "#6a737d",
    keyword: "#d73a49",
    operator: "#24292e",
    string: "#032f62",
    number: "#005cc5",
    literal: "#005cc5",
    functionName: "#6f42c1",
    variable: "#24292e",
    definition: "#24292e",
    typeName: "#6f42c1",
    property: "#005cc5",
    punctuation: "#24292e",
    meta: "#6a737d",
    invalid: "#b31d28",
  },
};

export function editorAppearance(theme: Theme): Extension[] {
  const palette = theme === "dark" ? DARK : LIGHT;
  return [chromeTheme(palette.chrome), syntaxTheme(palette.syntax)];
}
