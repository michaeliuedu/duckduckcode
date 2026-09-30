import { describe, expect, it } from "vitest";
import { appendResultRepr, appendStdoutBatch, formatPythonError, stripInternalFrames } from "./output";

describe("appendStdoutBatch", () => {
  it("restores the newline Pyodide's batched writer drops", () => {
    let out = "";
    out = appendStdoutBatch(out, "hello");
    out = appendStdoutBatch(out, "world");
    expect(out).toBe("hello\nworld\n");
  });

  it("does not double a newline that is already there", () => {
    expect(appendStdoutBatch("", "hello\n")).toBe("hello\n");
  });

  it("ignores empty chunks", () => {
    expect(appendStdoutBatch("kept", "")).toBe("kept");
  });
});

describe("formatPythonError", () => {
  it("unwraps Pyodide's JS wrapper around a traceback", () => {
    const error = new Error('PythonError: Traceback (most recent call last):\n  ZeroDivisionError: division by zero');
    expect(formatPythonError(error)).toBe("Traceback (most recent call last):\n  ZeroDivisionError: division by zero");
  });

  it("passes other messages through", () => {
    expect(formatPythonError(new Error("Timed out after 10s"))).toBe("Timed out after 10s");
    expect(formatPythonError("plain string")).toBe("plain string");
  });
});

describe("appendResultRepr", () => {
  it("appends the value of the last expression like a REPL", () => {
    expect(appendResultRepr("printed\n", "42")).toBe("printed\n42\n");
    expect(appendResultRepr("printed", "42")).toBe("printed\n42\n");
  });

  it("stays quiet about nothing-values", () => {
    expect(appendResultRepr("printed\n", undefined)).toBe("printed\n");
    expect(appendResultRepr("printed\n", null)).toBe("printed\n");
    expect(appendResultRepr("printed\n", "None")).toBe("printed\n");
    expect(appendResultRepr("printed\n", "")).toBe("printed\n");
  });
});

describe("stripInternalFrames", () => {
  it("removes the tracer's own frames from a traceback", () => {
    const traceback = [
      "Traceback (most recent call last):",
      '  File "<exec>", line 120, in <module>',
      '  File "main.py", line 3, in <module>',
      "ZeroDivisionError: division by zero",
    ].join("\n");
    expect(stripInternalFrames(traceback)).toBe(
      ["Traceback (most recent call last):", '  File "main.py", line 3, in <module>', "ZeroDivisionError: division by zero"].join("\n"),
    );
  });
});
