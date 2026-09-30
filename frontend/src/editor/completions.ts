/**
 * Python autocompletion without a language server: keywords, builtins, snippets,
 * common methods after a dot, and identifiers already present in the file.
 *
 * Deliberately small and offline — enough to keep typing fast, with no
 * illusion of being a type-aware completer.
 */

import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";

const KEYWORDS = [
  "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del",
  "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in",
  "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try", "while",
  "with", "yield", "False", "None", "True",
] as const;

const BUILTINS = [
  "abs", "all", "any", "bool", "dict", "divmod", "enumerate", "filter", "float", "format",
  "frozenset", "input", "int", "isinstance", "iter", "len", "list", "map", "max", "min",
  "next", "open", "ord", "chr", "pow", "print", "range", "repr", "reversed", "round",
  "set", "sorted", "str", "sum", "super", "tuple", "type", "zip",
] as const;

/** Methods offered after a `.`; a mixed bag of list, dict and str members. */
const METHODS = [
  "append", "clear", "copy", "count", "extend", "find", "get", "index", "insert", "items",
  "join", "keys", "lower", "pop", "remove", "replace", "reverse", "setdefault", "sort",
  "split", "startswith", "endswith", "strip", "update", "upper", "values",
] as const;

const KEYWORD_OPTIONS: Completion[] = KEYWORDS.map((label) => ({ label, type: "keyword" }));
const BUILTIN_OPTIONS: Completion[] = BUILTINS.map((label) => ({ label, type: "function" }));
const METHOD_OPTIONS: Completion[] = METHODS.map((label) => ({ label, type: "method" }));

const SNIPPET_OPTIONS: Completion[] = [
  snippetCompletion("def ${name}(${args}):\n    ${}", { label: "def", type: "keyword", detail: "function" }),
  snippetCompletion("class ${name}:\n    ${}", { label: "class", type: "keyword", detail: "class" }),
  snippetCompletion("if ${condition}:\n    ${}", { label: "if", type: "keyword", detail: "if" }),
  snippetCompletion("for ${item} in ${iterable}:\n    ${}", { label: "for", type: "keyword", detail: "for" }),
  snippetCompletion("while ${condition}:\n    ${}", { label: "while", type: "keyword", detail: "while" }),
  snippetCompletion("try:\n    ${}\nexcept ${Exception}:\n    ${}", { label: "try", type: "keyword", detail: "try/except" }),
  snippetCompletion("with ${expr} as ${name}:\n    ${}", { label: "with", type: "keyword", detail: "with" }),
  snippetCompletion('print(f"${label}: {${value}}")', { label: "printf", type: "function", detail: "f-string print" }),
];

const WORD = /[\w$]*$/;

/** How many identifiers from the document are offered, longest-lived first. */
const MAX_DOCUMENT_WORDS = 80;

/** Identifiers of three characters or more that already appear in the file. */
export function documentWords(text: string, exclude: string): Completion[] {
  const seen = new Set<string>();
  const options: Completion[] = [];
  for (const match of text.matchAll(/\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g)) {
    const label = match[0];
    if (label === exclude || seen.has(label)) continue;
    seen.add(label);
    options.push({ label, type: "variable" });
    if (options.length >= MAX_DOCUMENT_WORDS) break;
  }
  return options;
}

export function pythonCompletion(context: CompletionContext): CompletionResult | null {
  const afterDot = context.matchBefore(/\.[\w$]*$/);
  if (afterDot) {
    return { from: afterDot.from + 1, options: METHOD_OPTIONS, validFor: WORD };
  }

  const word = context.matchBefore(WORD);
  if (!word || (word.from === word.to && !context.explicit)) return null;

  return {
    from: word.from,
    options: [
      ...SNIPPET_OPTIONS,
      ...KEYWORD_OPTIONS,
      ...BUILTIN_OPTIONS,
      ...documentWords(context.state.doc.toString(), word.text),
    ],
    validFor: WORD,
  };
}
