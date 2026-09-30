/**
 * Test results.
 *
 * One row per case: did it pass, what came back, and what the author expected.
 * A hidden case shows its verdict but not its arguments — the point is to stop
 * someone reading the answer off the screen, not to be a security boundary
 * (the browser runs the tests, so it has the cases either way).
 */

import { caseLabel, formatValue, tally, type TestCase, type TestOutcome } from "@/python/tests";
import { duration } from "@/lib/format";
import { Badge } from "@/ui/Badge";
import { CheckCircleIcon, CrossCircleIcon } from "@/ui/Icons";
import type { Runner } from "./useRunner";

export function TestsView({ runner }: { runner: Runner }) {
  const running = runner.activity === "test";
  const run = runner.tests;

  if (runner.testCases.length === 0) {
    return (
      <p className="px-3 py-3 text-[13px] leading-relaxed text-[var(--muted)]" data-testid="tests-empty">
        This problem has no test cases. Run the file to see its output, or step through it with Visualize.
      </p>
    );
  }

  if (running) {
    return (
      <p className="px-3 py-3 text-[13px] text-[var(--brand)]" data-testid="tests-running">
        Running {runner.testCases.length} case{runner.testCases.length === 1 ? "" : "s"}…
      </p>
    );
  }

  if (!run) {
    return (
      <p className="px-3 py-3 text-[13px] leading-relaxed text-[var(--muted)]" data-testid="tests-idle">
        Press <strong className="font-semibold text-[var(--ink-soft)]">Test</strong> to check the file against the
        author&rsquo;s {runner.testCases.length} case{runner.testCases.length === 1 ? "" : "s"}. Both of you see the
        same result.
      </p>
    );
  }

  if (run.setupError) {
    return (
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2" data-testid="tests-setup-error">
        <p className="text-[13px] font-medium text-[var(--error)]">The file could not be loaded, so nothing ran.</p>
        <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[12.5px] text-[var(--error)]">
          {run.setupError}
        </pre>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto" data-testid="tests-results">
      <ul className="divide-y divide-[var(--line)]">
        {run.outcomes.map((outcome) => (
          <TestRow key={outcome.index} outcome={outcome} testCase={runner.testCases[outcome.index]} runner={runner} />
        ))}
      </ul>
    </div>
  );
}

function TestRow({
  outcome,
  testCase,
  runner,
}: {
  outcome: TestOutcome;
  testCase: TestCase | undefined;
  runner: Runner;
}) {
  const hidden = testCase?.hidden ?? false;
  return (
    <li
      className="px-3 py-2"
      data-testid={`test-result-${outcome.index}`}
      data-passed={outcome.passed ? "true" : "false"}
    >
      <div className="flex items-start gap-2">
        <span className={outcome.passed ? "mt-0.5 text-[var(--ok)]" : "mt-0.5 text-[var(--error)]"} aria-hidden>
          {outcome.passed ? <CheckCircleIcon size={14} /> : <CrossCircleIcon size={14} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
            <span className="sr-only">{outcome.passed ? "Passed:" : "Failed:"}</span>
            {caseLabel(testCase, outcome.index)}
            {hidden && <Badge tone="neutral">Hidden</Badge>}
          </p>

          {!outcome.passed && (
            <div className="mt-1.5 space-y-1 font-mono text-[12px]">
              {!hidden && testCase && (
                <p className="break-words text-[var(--muted)]">
                  {runner.entryPoint}({testCase.args.map(formatValue).join(", ")})
                </p>
              )}
              {outcome.error ? (
                <p className="break-words text-[var(--error)]">{outcome.error}</p>
              ) : (
                <>
                  <p className="break-words">
                    <span className="text-[var(--muted)]">got </span>
                    <span className="text-[var(--error)]">{outcome.actual || "nothing"}</span>
                  </p>
                  {!hidden && testCase && (
                    <p className="break-words">
                      <span className="text-[var(--muted)]">want </span>
                      <span className="text-[var(--ok)]">{formatValue(testCase.expected)}</span>
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {outcome.stdout && (
            <pre className="mt-1.5 whitespace-pre-wrap break-words rounded bg-[var(--chip)] px-2 py-1 font-mono text-[11.5px] text-[var(--ink-soft)]">
              {outcome.stdout}
            </pre>
          )}
        </div>
      </div>
    </li>
  );
}

/** The pass/fail summary shown in the console's tab bar. */
export function TestsBadge({ runner }: { runner: Runner }) {
  if (runner.activity === "test") return <Badge tone="brand">Running</Badge>;
  const run = runner.tests;
  if (!run || run.status === "running") return null;
  if (run.setupError) return <Badge tone="error">Did not run</Badge>;

  const counts = tally(run);
  if (counts.total === 0) return null;
  return (
    <span className="flex items-center gap-2" data-testid="tests-badge">
      <Badge tone={counts.allPassed ? "ok" : "error"}>
        {counts.passed}/{counts.total} passing
      </Badge>
      {run.durationMs !== undefined && (
        <span className="text-[12px] text-[var(--muted)]">{duration(run.durationMs)}</span>
      )}
    </span>
  );
}
