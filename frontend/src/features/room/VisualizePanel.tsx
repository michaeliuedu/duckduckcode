/**
 * Step through the recorded execution.
 *
 * Three things move together: the highlighted line in the editor, the copy of the
 * source on the left, and the frames and variables on the right. The step index
 * is shared, so walking through a bug is something both people watch at once.
 *
 * Variables that changed since the previous step are outlined, which is usually
 * the whole answer to "what did that line do?".
 */

import { useEffect, useRef } from "react";
import {
  changedLocals,
  frameLabel,
  MAX_TRACE_STEPS,
  valueLength,
  type TraceLocal,
  type TraceResult,
  type TraceStep,
} from "@/python/trace";
import { ChevronFirstIcon, ChevronLastIcon, ChevronLeftIcon, ChevronRightIcon } from "@/ui/Icons";
import { IconButton } from "@/ui/IconButton";
import { ValueView } from "./ValueView";
import type { Runner } from "./useRunner";

export function VisualizePanel({ runner }: { runner: Runner }) {
  const { trace, step: index } = runner;
  const tracing = runner.activity === "trace";
  const steps = trace?.steps ?? [];
  const step = steps[index] ?? null;
  const previous = steps[index - 1] ?? null;
  const last = Math.max(0, steps.length - 1);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="visualize-panel">
      <StepControls runner={runner} step={step} index={index} total={steps.length} last={last} tracing={tracing} />

      {step ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-2">
          <SourceStrip source={trace?.source ?? ""} currentLine={step.line} />
          <StepDetails step={step} previous={previous} trace={trace} />
        </div>
      ) : (
        <EmptyState runner={runner} tracing={tracing} />
      )}
    </div>
  );
}

function StepControls({
  runner,
  step,
  index,
  total,
  last,
  tracing,
}: {
  runner: Runner;
  step: TraceStep | null;
  index: number;
  total: number;
  last: number;
  tracing: boolean;
}) {
  const disabled = !step;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--line)] px-2 py-1.5">
      <IconButton
        label="First step"
        icon={<ChevronFirstIcon size={14} />}
        disabled={disabled || index <= 0}
        onClick={() => runner.setStep(0)}
        data-testid="visualize-first"
        className="!h-7 !w-7"
      />
      <IconButton
        label="Previous step"
        icon={<ChevronLeftIcon size={14} />}
        disabled={disabled || index <= 0}
        onClick={() => runner.setStep(index - 1)}
        data-testid="visualize-prev"
        className="!h-7 !w-7"
      />
      <IconButton
        label="Next step"
        icon={<ChevronRightIcon size={14} />}
        disabled={disabled || index >= last}
        onClick={() => runner.setStep(index + 1)}
        data-testid="visualize-next"
        className="!h-7 !w-7"
      />
      <IconButton
        label="Last step"
        icon={<ChevronLastIcon size={14} />}
        disabled={disabled || index >= last}
        onClick={() => runner.setStep(last)}
        data-testid="visualize-last"
        className="!h-7 !w-7"
      />

      {/* A scrubber makes a 300-step trace navigable; the buttons alone do not. */}
      <input
        type="range"
        min={0}
        max={last}
        step={1}
        value={index}
        disabled={disabled}
        aria-label="Step through the trace"
        data-testid="visualize-scrubber"
        className="trace-scrubber mx-1 max-w-[9rem] flex-1"
        onChange={(event) => runner.setStep(Number(event.target.value))}
      />

      <span className="px-1 text-[12px] text-[var(--muted)]" data-testid="visualize-step">
        {tracing && "Tracing…"}
        {!tracing && !step && (runner.trace ? "No steps" : "No trace yet")}
        {step && (
          <>
            Step {index + 1} / {total}
            <span className="ml-2 text-[var(--ink-soft)]">
              {frameLabel(step.fn)} · line {step.line}
              {step.event === "return" && " · return"}
              {step.event === "exception" && " · exception"}
            </span>
          </>
        )}
      </span>

      {runner.trace?.truncated && (
        <span className="ml-auto pr-1 text-[12px] text-[var(--warn)]">Stopped at {MAX_TRACE_STEPS} steps</span>
      )}
    </div>
  );
}

function EmptyState({ runner, tracing }: { runner: Runner; tracing: boolean }) {
  if (tracing) {
    return <p className="px-3 py-3 text-[13px] text-[var(--brand)]">Recording every line…</p>;
  }
  if (runner.trace?.stderr) {
    return (
      <pre className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[12.5px] whitespace-pre-wrap text-[var(--error)]">
        {runner.trace.stderr}
      </pre>
    );
  }
  if (runner.trace) {
    return <p className="px-3 py-3 text-[13px] text-[var(--muted)]">Nothing to step through — the file ran no statements.</p>;
  }
  return (
    <p className="px-3 py-3 text-[13px] leading-relaxed text-[var(--muted)]">
      Press <strong className="font-semibold text-[var(--ink-soft)]">Visualize</strong> to record the run line by line. The
      current line is highlighted in the editor, and both of you step through the same recording.
    </p>
  );
}

/** The source as it was when the trace ran, so the line numbers still mean something. */
function SourceStrip({ source, currentLine }: { source: string; currentLine: number }) {
  const root = useRef<HTMLDivElement | null>(null);
  const lines = source.length > 0 ? source.split("\n") : [""];

  useEffect(() => {
    root.current?.querySelector("[data-active='true']")?.scrollIntoView({ block: "nearest" });
  }, [currentLine]);

  return (
    <div
      ref={root}
      className="min-h-0 overflow-auto border-b border-[var(--line)] py-1 font-mono text-[12px] leading-[1.6] lg:border-b-0"
    >
      {lines.map((text, position) => {
        const lineNumber = position + 1;
        const active = lineNumber === currentLine;
        return (
          <div
            key={lineNumber}
            className={`flex gap-3 px-2 ${active ? "bg-[var(--trace-line)]" : ""}`}
            data-trace-line={lineNumber}
            data-active={active ? "true" : undefined}
          >
            <span className="w-7 shrink-0 select-none text-right text-[var(--muted)]">{lineNumber}</span>
            <span className="min-w-0 whitespace-pre-wrap">{text || " "}</span>
          </div>
        );
      })}
    </div>
  );
}

function StepDetails({
  step,
  previous,
  trace,
}: {
  step: TraceStep;
  previous: TraceStep | null;
  trace: TraceResult | null;
}) {
  const frames = step.stack.length > 0 ? step.stack : [{ fn: step.fn, line: step.line }];
  const changed = changedLocals(step.locals, previous?.locals ?? []);

  return (
    <aside className="min-h-0 overflow-auto px-3 py-2 lg:border-l lg:border-[var(--line)]">
      <SectionTitle>Frames</SectionTitle>
      <ol className="mt-1.5 space-y-1">
        {frames.map((frame, position) => (
          <li
            key={`${frame.fn}-${position}`}
            className={`rounded-md px-2 py-1 text-[12px] ${
              position === frames.length - 1 ? "bg-[var(--chip)] font-medium" : "text-[var(--muted)]"
            }`}
          >
            {frameLabel(frame.fn)}
            <span className="ml-1 font-normal text-[var(--muted)]">:{frame.line}</span>
          </li>
        ))}
      </ol>

      <SectionTitle className="mt-3">Variables</SectionTitle>
      {step.locals.length === 0 ? (
        <p className="mt-1 text-[12px] text-[var(--muted)]">Nothing defined yet.</p>
      ) : (
        <ul className="mt-1.5 space-y-2.5">
          {step.locals.map((local) => (
            <li key={local.name} data-testid="visualize-var" data-var-name={local.name}>
              <VariableView
                local={local}
                previous={previous?.locals.find((earlier) => earlier.name === local.name)}
                locals={step.locals}
                changed={changed.has(local.name)}
              />
            </li>
          ))}
        </ul>
      )}

      {step.returnValue && (
        <p className="mt-2 font-mono text-[12px]">
          <span className="text-[var(--muted)]">return </span>
          {step.returnValue}
        </p>
      )}
      {step.exception && <p className="mt-2 text-[12px] text-[var(--error)]">{step.exception}</p>}

      <SectionTitle className="mt-3">Printed so far</SectionTitle>
      <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[12px] text-[var(--ink-soft)]">
        {step.stdout || <span className="text-[var(--muted)]">(nothing)</span>}
      </pre>
      {trace?.stderr && (
        <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[12px] text-[var(--error)]">{trace.stderr}</pre>
      )}
    </aside>
  );
}

function SectionTitle({ children, className = "" }: { children: string; className?: string }) {
  return (
    <p className={`text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)] ${className}`.trim()}>{children}</p>
  );
}

/** One variable: its name, its type, and the best view of its value. */
function VariableView({
  local,
  previous,
  locals,
  changed,
}: {
  local: TraceLocal;
  previous: TraceLocal | undefined;
  locals: readonly TraceLocal[];
  changed: boolean;
}) {
  return (
    <div className={changed ? "var-changed" : ""}>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[12.5px] font-medium">{local.name}</span>
        <span className="text-[11px] text-[var(--muted)]">
          {local.kind}
          {local.value && ` · ${valueLength(local.value)}`}
        </span>
      </div>

      {local.value ? (
        <ValueView value={local.value} previous={previous?.value} locals={locals} name={local.name} />
      ) : (
        <pre className="mt-0.5 overflow-x-auto font-mono text-[12px] text-[var(--ink-soft)]">{local.repr}</pre>
      )}
    </div>
  );
}
