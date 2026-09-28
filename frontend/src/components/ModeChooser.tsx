"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom, listProblems, type ProblemSummary } from "@/lib/api";
import { useConfig } from "./ConfigProvider";

type Step = "choose" | "practice";

export function ModeChooser() {
  const { backendUrl } = useConfig();
  const router = useRouter();
  const [step, setStep] = useState<Step>("choose");
  const [problems, setProblems] = useState<ProblemSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== "practice" || problems !== null) return;
    let cancelled = false;
    listProblems(backendUrl)
      .then((res) => {
        if (!cancelled) setProblems(res.problems);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(`Could not load problems: ${err.message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [step, problems, backendUrl]);

  async function start(body: { mode: "blank" } | { mode: "practice"; problemId: string }) {
    const key = body.mode === "blank" ? "blank" : body.problemId;
    setBusy(key);
    setError(null);
    try {
      const { room } = await createRoom(backendUrl, body);
      router.push(`/rooms/${room.id}`);
    } catch (err) {
      setError(`Could not create workspace: ${(err as Error).message}`);
      setBusy(null);
    }
  }

  return (
    <section aria-live="polite">
      {error && (
        <div role="alert" className="mb-6 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {step === "choose" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setStep("practice")}
            className="group rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-left transition hover:border-amber-400/60 hover:bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <div className="text-2xl" aria-hidden>
              🧩
            </div>
            <h2 className="mt-3 text-lg font-semibold">Practice problem</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Pick one of three short problems. The statement sits beside the editor and starter code is pre-filled.
            </p>
            <span className="mt-4 inline-block text-sm font-medium text-amber-400 group-hover:underline">Choose a problem →</span>
          </button>

          <button
            type="button"
            onClick={() => start({ mode: "blank" })}
            disabled={busy !== null}
            className="group rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-left transition hover:border-sky-400/60 hover:bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-60"
          >
            <div className="text-2xl" aria-hidden>
              📝
            </div>
            <h2 className="mt-3 text-lg font-semibold">Blank workspace</h2>
            <p className="mt-1 text-sm text-zinc-400">An empty Python file for walking through whatever the student brought.</p>
            <span className="mt-4 inline-block text-sm font-medium text-sky-400 group-hover:underline">
              {busy === "blank" ? "Creating…" : "Open blank workspace →"}
            </span>
          </button>
        </div>
      )}

      {step === "practice" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Choose a problem</h2>
            <button
              type="button"
              onClick={() => setStep("choose")}
              className="text-sm text-zinc-400 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 rounded"
            >
              ← Back
            </button>
          </div>
          {problems === null ? (
            <p className="text-sm text-zinc-400">Loading problems…</p>
          ) : (
            <ul className="grid gap-3">
              {problems.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => start({ mode: "practice", problemId: p.id })}
                    disabled={busy !== null}
                    data-testid={`problem-${p.id}`}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 text-left transition hover:border-amber-400/60 hover:bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-60"
                  >
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold">{p.title}</h3>
                      <DifficultyBadge level={p.difficulty} />
                      <span className="ml-auto text-xs uppercase tracking-wide text-zinc-500">{p.language}</span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-400">{p.summary}</p>
                    {busy === p.id && <p className="mt-2 text-xs text-amber-400">Creating workspace…</p>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export function DifficultyBadge({ level }: { level: string }) {
  const tone =
    level === "easy"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : level === "medium"
        ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
        : "bg-rose-500/15 text-rose-300 border-rose-500/30";
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>{level}</span>;
}
