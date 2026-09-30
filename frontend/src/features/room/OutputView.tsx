/**
 * Program output.
 *
 * While the run is happening in this browser, what is shown is the live stream —
 * the point is to see a slow loop printing. Once it finishes, the shared result
 * takes over, which is also what everyone else in the room has been waiting for.
 */

import { isEmptyRun, type RunResult } from "@/python/run";
import type { Runner } from "./useRunner";

export function OutputView({ runner }: { runner: Runner }) {
  const local = runner.activity !== null;
  const result = runner.run;
  const status = local ? "running" : (result?.status ?? "idle");

  return (
    <pre
      data-testid="output-text"
      data-status={status}
      className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[12.5px] leading-relaxed"
    >
      {local ? <LiveOutput runner={runner} /> : <FinishedOutput result={result} remoteRunning={runner.remoteRunning} />}
    </pre>
  );
}

function LiveOutput({ runner }: { runner: Runner }) {
  return (
    <>
      {runner.liveOutput}
      <span className="text-[var(--muted)]">{runner.activity === "trace" ? "Tracing…" : "Running…"}</span>
    </>
  );
}

function FinishedOutput({ result, remoteRunning }: { result: RunResult | null; remoteRunning: boolean }) {
  if (remoteRunning && result) {
    return <span className="text-[var(--brand)]">{result.by} is running it…</span>;
  }
  if (!result || result.status === "running") {
    return (
      <span className="text-[var(--muted)]">
        Run main.py to see its output here. Whoever presses Run, you both see the same result.
      </span>
    );
  }
  return (
    <>
      {result.stdout}
      {result.stderr && <span className="text-[var(--error)]">{result.stderr}</span>}
      {isEmptyRun(result) && <span className="text-[var(--muted)]">(no output)</span>}
    </>
  );
}
