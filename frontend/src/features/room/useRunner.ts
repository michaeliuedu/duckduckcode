/**
 * Running and tracing the shared file.
 *
 * Everyone in the room sees the same result, so the outcome is published into the
 * shared metadata rather than kept in component state. Only the person who
 * pressed the button actually executes anything.
 *
 * Streaming output is deliberately local: each shared write becomes a persisted
 * update on the server, so publishing every printed line would turn one run into
 * hundreds of rows. Peers see "running", then the finished output.
 */

import { useCallback, useRef, useState } from "react";
import { useSharedCell } from "@/collab/sharedCell";
import type { RoomSession } from "@/collab/session";
import { api } from "@/api/client";
import { currentUser } from "@/auth/session";
import { useEvent } from "@/lib/hooks";
import { useObservable } from "@/lib/observable";
import { useParticipant } from "@/lib/participant";
import { appendStdoutBatch } from "@/python/output";
import type { RunResult } from "@/python/run";
import {
  pythonLoadError,
  pythonStatus,
  runPython,
  stopPython,
  testPython,
  tracePython,
  type PythonStatus,
} from "@/python/runner";
import type { TestCase, TestRun } from "@/python/tests";
import { clampStepIndex, type TraceResult } from "@/python/trace";

export type RunnerActivity = "run" | "trace" | "test" | null;

export interface Runner {
  /** The last run, shared with the room. */
  run: RunResult | null;
  /** The last trace, shared with the room. */
  trace: TraceResult | null;
  /** The last test run, shared with the room. */
  tests: TestRun | null;
  /** The shared step pointer, clamped into the trace. */
  step: number;
  /** The line to highlight in the editor, or `null`. */
  currentLine: number | null;
  setStep: (index: number) => void;

  /**
   * We are executing something. Only this disables the buttons: a peer whose tab
   * died mid-run must not be able to lock everyone else out of the Run button.
   */
  activity: RunnerActivity;
  /** Someone else is executing something, worth saying but not worth blocking. */
  remoteRunning: boolean;
  /** Output printed so far by the run happening in this browser. */
  liveOutput: string;

  pythonStatus: PythonStatus;
  pythonError: string | null;

  runCode: () => void;
  visualizeCode: () => void;
  /** Runs the problem's test cases. No-op when the room has none. */
  runTests: () => void;
  /** The cases this room can check, from the problem snapshot. */
  testCases: readonly TestCase[];
  entryPoint: string;
  stop: () => void;
}

export interface RunnerOptions {
  /** The problem's entry point and cases, from the room's snapshot. */
  entryPoint?: string;
  testCases?: readonly TestCase[];
  /** The problem's slug, so a test run can count towards progress. */
  problemId?: string;
  /**
   * Called the moment execution starts here. Lets the layout react to a run as
   * the event it is, instead of watching state change afterwards.
   */
  onStart?: (kind: Exclude<RunnerActivity, null>) => void;
}

export function useRunner(session: RoomSession, options: RunnerOptions = {}): Runner {
  const participant = useParticipant();
  const entryPoint = options.entryPoint ?? "";
  const testCases = options.testCases ?? EMPTY_CASES;
  const problemId = options.problemId ?? "";
  const onStart = useEvent((kind: Exclude<RunnerActivity, null>) => options.onStart?.(kind));
  const run = useSharedCell(session.shared.run);
  const trace = useSharedCell(session.shared.trace);
  const tests = useSharedCell(session.shared.tests);
  const rawStep = useSharedCell(session.shared.traceStep);
  const status = useObservable(pythonStatus);
  const loadError = useObservable(pythonLoadError);

  const [activity, setActivity] = useState<RunnerActivity>(null);
  const [liveOutput, setLiveOutput] = useState("");
  // A ref as well as state: two clicks in the same tick must not both start.
  const inFlight = useRef(false);

  const step = clampStepIndex(rawStep, trace?.steps.length ?? 0);
  const currentStep = trace?.steps[step] ?? null;

  const setStep = useCallback(
    (index: number) => {
      session.shared.traceStep.set(clampStepIndex(index, trace?.steps.length ?? 0));
    },
    [session, trace],
  );

  const begin = useCallback(
    (kind: Exclude<RunnerActivity, null>) => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setActivity(kind);
      setLiveOutput("");
      onStart(kind);
      return { by: participant.name, startedAt: Date.now() };
    },
    [onStart, participant.name],
  );

  const end = useCallback(() => {
    inFlight.current = false;
    setActivity(null);
  }, []);

  const runCode = useCallback(() => {
    const started = begin("run");
    if (!started) return;
    const { by, startedAt } = started;

    session.shared.run.set({ status: "running", stdout: "", stderr: "", by, at: startedAt });

    void runPython(session.getSource(), {
      // Shown immediately, so a long-running loop is visibly doing something.
      onOutput: (chunk) => setLiveOutput((previous) => appendStdoutBatch(previous, chunk)),
    })
      .then((outcome) => {
        const stderr = [outcome.stderr, outcome.error].filter(Boolean).join("\n");
        session.shared.run.set({
          status: outcome.error ? "error" : "ok",
          stdout: outcome.stdout,
          stderr,
          by,
          at: Date.now(),
          durationMs: Date.now() - startedAt,
        });
      })
      .finally(end);
  }, [begin, end, session]);

  const visualizeCode = useCallback(() => {
    const started = begin("trace");
    if (!started) return;
    const { by, startedAt } = started;
    const source = session.getSource();

    session.publishTrace({ status: "running", source, steps: [], stdout: "", stderr: "", truncated: false, by, at: startedAt });
    session.shared.run.set({ status: "running", stdout: "", stderr: "", by, at: startedAt });

    void tracePython(source)
      .then((outcome) => {
        const stderr = [outcome.stderr, outcome.error].filter(Boolean).join("\n");
        const failed = Boolean(outcome.error);
        const at = Date.now();
        const durationMs = at - startedAt;
        session.publishTrace({
          status: failed ? "error" : "ok",
          source,
          steps: outcome.steps,
          stdout: outcome.stdout,
          stderr,
          truncated: outcome.truncated,
          by,
          at,
          durationMs,
        });
        // The trace also produces ordinary output, so the Output tab stays useful.
        session.shared.run.set({
          status: failed ? "error" : "ok",
          stdout: outcome.stdout,
          stderr,
          by,
          at,
          durationMs,
        });
      })
      .finally(end);
  }, [begin, end, session]);

  const runTests = useCallback(() => {
    if (testCases.length === 0 || entryPoint === "") return;
    const started = begin("test");
    if (!started) return;
    const { by, startedAt } = started;

    session.shared.tests.set({ status: "running", outcomes: [], setupError: "", by, at: startedAt });

    void testPython(session.getSource(), entryPoint, [...testCases])
      .then((outcome) => {
        session.shared.tests.set({
          status: outcome.setupError ? "error" : "ok",
          outcomes: outcome.outcomes,
          setupError: outcome.setupError,
          by,
          at: Date.now(),
          durationMs: Date.now() - startedAt,
        });

        // Count it towards the grid. Only for the person who pressed the
        // button, and only when signed in — an anonymous visitor has nowhere
        // to record it. Failing to record must not fail the run.
        const passed =
          !outcome.setupError &&
          outcome.outcomes.length > 0 &&
          outcome.outcomes.every((result) => result.passed);
        if (problemId && currentUser()) {
          void api.recordAttempt(problemId, passed).catch(() => {
            /* progress is not worth interrupting anyone over */
          });
        }
      })
      .finally(end);
  }, [begin, end, entryPoint, problemId, session, testCases]);

  const stop = useCallback(() => {
    if (!inFlight.current) return;
    stopPython("Stopped.");
  }, []);

  return {
    run,
    trace,
    tests,
    step,
    currentLine: currentStep?.line ?? null,
    setStep,
    activity,
    remoteRunning:
      activity === null &&
      (run?.status === "running" || trace?.status === "running" || tests?.status === "running"),
    liveOutput,
    pythonStatus: status,
    pythonError: loadError,
    runCode,
    visualizeCode,
    runTests,
    testCases,
    entryPoint,
    stop,
  };
}

/** A stable empty array, so a room with no tests does not re-run effects. */
const EMPTY_CASES: readonly TestCase[] = [];
