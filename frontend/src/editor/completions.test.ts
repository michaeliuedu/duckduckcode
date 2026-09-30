import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { documentWords, pythonCompletion } from "./completions";

function complete(doc: string, explicit = true) {
  const state = EditorState.create({ doc });
  return pythonCompletion(new CompletionContext(state, doc.length, explicit));
}

function labels(doc: string, explicit = true): string[] {
  return complete(doc, explicit)?.options.map((option) => option.label) ?? [];
}

describe("pythonCompletion", () => {
  it("suggests builtins for a prefix", () => {
    expect(labels("pri")).toContain("print");
  });

  it("suggests keywords", () => {
    expect(labels("ret")).toContain("return");
  });

  it("offers snippets", () => {
    expect(labels("de")).toContain("def");
  });

  it("suggests methods after a dot, and only methods", () => {
    const result = complete("nums.");
    expect(result?.options.map((option) => option.label)).toContain("append");
    expect(result?.options.map((option) => option.label)).not.toContain("print");
  });

  it("starts the method completion after the dot", () => {
    const result = complete("nums.");
    expect(result?.from).toBe("nums".length + 1);
  });

  it("suggests identifiers already in the file", () => {
    expect(labels("longest_substring\nlon")).toContain("longest_substring");
  });

  it("stays quiet at a word boundary unless explicitly asked", () => {
    expect(complete("print(", false)).toBeNull();
    expect(complete("print(", true)).not.toBeNull();
  });
});

describe("documentWords", () => {
  it("collects identifiers of three characters or more, once each", () => {
    expect(documentWords("total = total + item", "")).toEqual([
      { label: "total", type: "variable" },
      { label: "item", type: "variable" },
    ]);
  });

  it("skips the word being typed", () => {
    expect(documentWords("total = 1", "total")).toEqual([]);
  });

  it("skips very short names, which are never worth a popup", () => {
    expect(documentWords("i = 0\nxy = 1", "")).toEqual([]);
  });

  it("caps how many it offers", () => {
    const source = Array.from({ length: 200 }, (_, index) => `name_${index}`).join(" ");
    expect(documentWords(source, "")).toHaveLength(80);
  });
});
