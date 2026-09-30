/**
 * The authoring form.
 *
 * Examples and test cases are repeating, nested structures, so they are edited
 * as React state and posted as one JSON field each rather than as
 * `tests[0][args]`-style inputs — see `readProblemDraft`. Everything else is a
 * plain form control, so the browser handles it.
 */

import { useState } from "react";
import { Form, useNavigation } from "react-router";
import type { ProblemDraft, ProblemExample, TestCase } from "@/api/types";
import type { FieldErrors } from "@/api/client";
import { Button } from "@/ui/Button";
import { Field, FormError } from "@/ui/Field";
import { PlusIcon, TrashIcon } from "@/ui/Icons";
import { IconButton } from "@/ui/IconButton";
import { Markdown } from "@/ui/Markdown";

export interface ProblemFormProps {
  initial: ProblemDraft;
  fields: FieldErrors;
  error?: string;
  submitLabel: string;
  /** Extra fields posted alongside, e.g. an intent. */
  hidden?: Record<string, string>;
}

const BLANK_EXAMPLE: ProblemExample = { input: "", output: "", explanation: "" };
const BLANK_TEST: TestCase = { name: "", args: [], expected: null, hidden: false };

export function ProblemForm({ initial, fields, error, submitLabel, hidden = {} }: ProblemFormProps) {
  const navigation = useNavigation();
  const [statement, setStatement] = useState(initial.statement);
  const [examples, setExamples] = useState<ProblemExample[]>(initial.examples);
  const [tests, setTests] = useState<TestCase[]>(initial.tests);
  const [preview, setPreview] = useState(false);

  return (
    <Form method="post" className="mt-7 flex flex-col gap-6" data-testid="problem-form">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {/* Serialised on every render, so the posted value always matches what
          is on screen. */}
      <input type="hidden" name="examples" value={JSON.stringify(examples)} />
      <input type="hidden" name="tests" value={JSON.stringify(tests)} />

      {error && <FormError>{error}</FormError>}

      <Field
        label="Title"
        name="title"
        defaultValue={initial.title}
        required
        maxLength={120}
        error={fields.title}
        hint="The URL is made from this, and it does not change afterwards."
      />
      <Field
        label="One-line summary"
        name="summary"
        defaultValue={initial.summary}
        maxLength={300}
        error={fields.summary}
        hint="Shown on cards and in search results."
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="difficulty" className="text-[13px] font-medium">
          Difficulty
        </label>
        <select id="difficulty" name="difficulty" defaultValue={initial.difficulty} className="field h-9 w-40 text-[14px]">
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>

      <section>
        <div className="flex items-center justify-between">
          <label htmlFor="statement" className="text-[13px] font-medium">
            Statement
          </label>
          <button
            type="button"
            className="text-[12px] font-medium text-[var(--brand)]"
            onClick={() => setPreview((on) => !on)}
            data-testid="toggle-preview"
          >
            {preview ? "Write" : "Preview"}
          </button>
        </div>
        {preview ? (
          <div className="mt-1.5 min-h-[180px] rounded-md border border-[var(--line)] bg-[var(--panel)] px-3.5 py-3">
            {statement.trim() ? (
              <Markdown source={statement} />
            ) : (
              <p className="text-[13px] text-[var(--muted)]">Nothing to preview yet.</p>
            )}
          </div>
        ) : (
          <textarea
            id="statement"
            name="statement"
            value={statement}
            onChange={(event) => setStatement(event.target.value)}
            rows={12}
            className="field mt-1.5 h-auto w-full py-2 font-mono text-[13px] leading-relaxed"
            placeholder={"Markdown. **Bold**, `code`, lists and tables all work."}
            data-testid="statement-input"
          />
        )}
        {fields.statement && (
          <p role="alert" className="mt-1.5 text-[12px] text-[var(--error)]">
            {fields.statement}
          </p>
        )}
      </section>

      <ExampleEditor examples={examples} onChange={setExamples} error={fields.examples} />

      <section>
        <h2 className="text-[15px] font-semibold">Starter code</h2>
        <p className="mt-1 text-[13px] text-[var(--muted)]">
          What the editor is pre-filled with when someone starts a room.
        </p>
        <textarea
          name="starterCode"
          defaultValue={initial.starterCode}
          rows={10}
          spellCheck={false}
          className="field mt-3 h-auto w-full py-2 font-mono text-[12.5px] leading-relaxed"
          data-testid="starter-input"
        />
        {fields.starterCode && (
          <p role="alert" className="mt-1.5 text-[12px] text-[var(--error)]">
            {fields.starterCode}
          </p>
        )}
      </section>

      <TestEditor
        tests={tests}
        onChange={setTests}
        entryPoint={initial.entryPoint}
        entryPointError={fields.entryPoint}
        error={fields.tests}
      />

      <div className="flex items-center gap-3 border-t border-[var(--line)] pt-6">
        <Button type="submit" variant="primary" busy={navigation.state === "submitting"} data-testid="save-problem">
          {submitLabel}
        </Button>
        <p className="text-[12px] text-[var(--muted)]">Saved as a draft. Nobody else sees it until you publish.</p>
      </div>
    </Form>
  );
}

function ExampleEditor({
  examples,
  onChange,
  error,
}: {
  examples: ProblemExample[];
  onChange: (next: ProblemExample[]) => void;
  error?: string;
}) {
  const update = (index: number, patch: Partial<ProblemExample>) =>
    onChange(examples.map((example, i) => (i === index ? { ...example, ...patch } : example)));

  return (
    <section data-testid="example-editor">
      <h2 className="text-[15px] font-semibold">Worked examples</h2>
      <p className="mt-1 text-[13px] text-[var(--muted)]">
        Shown beside the statement. These are for reading — the test cases below are what actually run.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-[var(--error)]">
          {error}
        </p>
      )}

      <div className="mt-3 space-y-3">
        {examples.map((example, index) => (
          <div key={index} className="rounded-md border border-[var(--line)] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-[var(--muted)]">Example {index + 1}</span>
              <IconButton
                label={`Remove example ${index + 1}`}
                icon={<TrashIcon size={14} />}
                className="!h-7 !w-7"
                onClick={() => onChange(examples.filter((_, i) => i !== index))}
              />
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                aria-label={`Example ${index + 1} input`}
                placeholder="Input"
                value={example.input}
                onChange={(event) => update(index, { input: event.target.value })}
                className="field font-mono text-[12.5px]"
              />
              <input
                aria-label={`Example ${index + 1} output`}
                placeholder="Output"
                value={example.output}
                onChange={(event) => update(index, { output: event.target.value })}
                className="field font-mono text-[12.5px]"
              />
            </div>
            <input
              aria-label={`Example ${index + 1} explanation`}
              placeholder="Explanation (optional)"
              value={example.explanation ?? ""}
              onChange={(event) => update(index, { explanation: event.target.value })}
              className="field mt-2 w-full text-[13px]"
            />
          </div>
        ))}
      </div>

      <Button
        variant="ghost"
        size="sm"
        icon={<PlusIcon size={13} />}
        className="mt-3"
        onClick={() => onChange([...examples, { ...BLANK_EXAMPLE }])}
        data-testid="add-example"
      >
        Add an example
      </Button>
    </section>
  );
}

/**
 * The test-case editor.
 *
 * Arguments and expected values are JSON, validated as you type: a case that
 * cannot be parsed is worse than no case, and finding out at submit time
 * would mean hunting for which of forty rows is wrong.
 */
function TestEditor({
  tests,
  onChange,
  entryPoint,
  entryPointError,
  error,
}: {
  tests: TestCase[];
  onChange: (next: TestCase[]) => void;
  entryPoint: string;
  entryPointError?: string;
  error?: string;
}) {
  const update = (index: number, patch: Partial<TestCase>) =>
    onChange(tests.map((test, i) => (i === index ? { ...test, ...patch } : test)));

  return (
    <section data-testid="test-editor">
      <h2 className="text-[15px] font-semibold">Test cases</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
        Each case calls one function with a list of arguments and compares what it returns. Values are JSON, so{" "}
        <code className="rounded bg-[var(--chip)] px-1 py-0.5 font-mono text-[12px]">[[1, 2], 3]</code> means two
        arguments: a list and a number.
      </p>

      <div className="mt-4">
        <Field
          label="Function to call"
          name="entryPoint"
          defaultValue={entryPoint}
          spellCheck={false}
          error={entryPointError}
          hint="The name defined in the starter code, e.g. flock_sizes."
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[12px] text-[var(--error)]" data-testid="tests-error">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {tests.map((test, index) => (
          <TestRow
            key={index}
            index={index}
            test={test}
            entryPoint={entryPoint}
            onUpdate={(patch) => update(index, patch)}
            onRemove={() => onChange(tests.filter((_, i) => i !== index))}
          />
        ))}
      </div>

      <Button
        variant="ghost"
        size="sm"
        icon={<PlusIcon size={13} />}
        className="mt-3"
        onClick={() => onChange([...tests, { ...BLANK_TEST }])}
        data-testid="add-test"
      >
        Add a test case
      </Button>
    </section>
  );
}

function TestRow({
  index,
  test,
  entryPoint,
  onUpdate,
  onRemove,
}: {
  index: number;
  test: TestCase;
  entryPoint: string;
  onUpdate: (patch: Partial<TestCase>) => void;
  onRemove: () => void;
}) {
  // The text being typed is kept separately from the parsed value: half-typed
  // JSON is not valid JSON, and the field must not fight the person writing it.
  const [argsText, setArgsText] = useState(() => JSON.stringify(test.args));
  const [expectedText, setExpectedText] = useState(() => JSON.stringify(test.expected ?? null));
  const [argsError, setArgsError] = useState("");
  const [expectedError, setExpectedError] = useState("");

  const commitArgs = (raw: string) => {
    setArgsText(raw);
    try {
      const parsed: unknown = JSON.parse(raw || "[]");
      if (!Array.isArray(parsed)) {
        setArgsError("Arguments are a list, so this needs square brackets.");
        return;
      }
      setArgsError("");
      onUpdate({ args: parsed });
    } catch {
      setArgsError("Not valid JSON yet.");
    }
  };

  const commitExpected = (raw: string) => {
    setExpectedText(raw);
    try {
      const parsed: unknown = JSON.parse(raw || "null");
      setExpectedError("");
      onUpdate({ expected: parsed });
    } catch {
      setExpectedError("Not valid JSON yet.");
    }
  };

  return (
    <div className="rounded-md border border-[var(--line)] p-3" data-testid={`test-row-${index}`}>
      <div className="flex items-center gap-2">
        <input
          aria-label={`Test ${index + 1} name`}
          placeholder={`Case ${index + 1} — what does it check?`}
          value={test.name}
          onChange={(event) => onUpdate({ name: event.target.value })}
          className="field flex-1 text-[13px]"
        />
        <label className="flex shrink-0 items-center gap-1.5 text-[12px] text-[var(--muted)]">
          <input
            type="checkbox"
            checked={test.hidden}
            onChange={(event) => onUpdate({ hidden: event.target.checked })}
            data-testid={`test-hidden-${index}`}
          />
          Hidden
        </label>
        <IconButton
          label={`Remove test ${index + 1}`}
          icon={<TrashIcon size={14} />}
          className="!h-7 !w-7"
          onClick={onRemove}
        />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
            {entryPoint || "function"}(…) arguments
          </label>
          <input
            aria-label={`Test ${index + 1} arguments`}
            value={argsText}
            onChange={(event) => commitArgs(event.target.value)}
            spellCheck={false}
            className="field mt-1 w-full font-mono text-[12.5px]"
            data-testid={`test-args-${index}`}
            data-error={argsError ? "true" : undefined}
          />
          {argsError && <p className="mt-1 text-[11px] text-[var(--error)]">{argsError}</p>}
        </div>
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Expected result</label>
          <input
            aria-label={`Test ${index + 1} expected result`}
            value={expectedText}
            onChange={(event) => commitExpected(event.target.value)}
            spellCheck={false}
            className="field mt-1 w-full font-mono text-[12.5px]"
            data-testid={`test-expected-${index}`}
            data-error={expectedError ? "true" : undefined}
          />
          {expectedError && <p className="mt-1 text-[11px] text-[var(--error)]">{expectedError}</p>}
        </div>
      </div>
    </div>
  );
}
