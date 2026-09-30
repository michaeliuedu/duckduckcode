/** Write a new problem. Saved as a draft; publishing is a separate step. */

import { Link, useActionData } from "react-router";
import type { ProblemDraft } from "@/api/types";
import { ProblemForm } from "@/features/problems/ProblemForm";
import { AppHeader } from "@/ui/AppHeader";
import { ArrowLeftIcon } from "@/ui/Icons";
import type { FormFailure } from "./authActions";

/** A starting point that already runs, so the first Test press does something. */
const STARTER: ProblemDraft = {
  title: "",
  summary: "",
  statement: "",
  difficulty: "easy",
  entryPoint: "solve",
  starterCode: `def solve(values):
    """Describe what this should return."""
    # TODO
    return []
`,
  examples: [{ input: "", output: "", explanation: "" }],
  tests: [{ name: "", args: [[]], expected: [], hidden: false }],
};

export function NewProblemPage() {
  const failure = useActionData() as FormFailure | undefined;

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />
      <main className="page-narrow">
        <Link to="/" className="btn btn-quiet btn-sm -ml-2">
          <ArrowLeftIcon size={14} />
          Home
        </Link>
        <h1 className="mt-3 text-[26px] font-semibold tracking-tight">Write a problem</h1>
        <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-[var(--muted)]">
          A statement, some starter code, and the cases that check an answer. You can publish it once it looks right.
        </p>
        <ProblemForm
          initial={STARTER}
          fields={failure?.fields ?? {}}
          error={failure?.error}
          submitLabel="Create draft"
        />
      </main>
    </div>
  );
}
