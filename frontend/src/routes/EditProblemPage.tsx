/** Edit a problem you wrote, and decide who can see it. */

import { Form, Link, useActionData, useLoaderData, useNavigation, useSearchParams } from "react-router";
import type { Visibility } from "@/api/types";
import { ProblemForm } from "@/features/problems/ProblemForm";
import { AppHeader } from "@/ui/AppHeader";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { ArrowLeftIcon, TrashIcon } from "@/ui/Icons";
import { FormSuccess } from "@/ui/Field";
import type { FormFailure } from "./authActions";
import type { ProblemLoaderData } from "./loaders";

const VISIBILITY_COPY: Record<string, string> = {
  draft: "Only you can see this.",
  unlisted: "Anyone with the link can see it. It stays out of search and the home page.",
  public: "Listed on the home page and in search.",
};

export function EditProblemPage() {
  const { problem } = useLoaderData() as ProblemLoaderData;
  const result = useActionData() as (FormFailure & { saved?: never }) | { saved: string } | undefined;
  const navigation = useNavigation();
  const [params] = useSearchParams();

  const failure = result && "error" in result ? result : undefined;
  const saved = result && "saved" in result ? result.saved : undefined;
  const changingVisibility = navigation.formData?.get("intent") === "visibility";

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />
      <main className="page-narrow">
        <Link to={`/problems/${problem.id}`} className="btn btn-quiet btn-sm -ml-2">
          <ArrowLeftIcon size={14} />
          Back to the problem
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-[26px] font-semibold tracking-tight">Edit problem</h1>
          <Badge
            tone={problem.visibility === "public" ? "ok" : problem.visibility === "draft" ? "warn" : "neutral"}
            className="problem-visibility"
          >
            <span data-testid="problem-visibility">{problem.visibility}</span>
          </Badge>
        </div>
        <p className="mt-1.5 text-[13px] text-[var(--muted)]">
          <code className="rounded bg-[var(--chip)] px-1.5 py-0.5 font-mono text-[12px]">/problems/{problem.id}</code>{" "}
          — the address does not change when you rename it.
        </p>

        {params.get("created") === "1" && (
          <div className="mt-5">
            <FormSuccess testId="created-banner">
              Draft created. Add your test cases, then publish when it is ready.
            </FormSuccess>
          </div>
        )}
        {saved === "draft" && (
          <div className="mt-5">
            <FormSuccess>Saved.</FormSuccess>
          </div>
        )}
        {saved === "visibility" && (
          <div className="mt-5">
            <FormSuccess>Visibility updated.</FormSuccess>
          </div>
        )}

        <section className="mt-6 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="text-[14px] font-semibold">Who can see it</h2>
          <p className="mt-1 text-[13px] text-[var(--muted)]">{VISIBILITY_COPY[problem.visibility]}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["draft", "unlisted", "public"] as Visibility[]).map((option) => (
              <Form method="post" key={option}>
                <input type="hidden" name="intent" value="visibility" />
                <input type="hidden" name="visibility" value={option} />
                <Button
                  type="submit"
                  size="sm"
                  variant={problem.visibility === option ? "primary" : "ghost"}
                  busy={changingVisibility && navigation.formData?.get("visibility") === option}
                  data-testid={`visibility-${option}`}
                >
                  {option === "draft" ? "Keep private" : option === "unlisted" ? "Unlisted" : "Publish"}
                </Button>
              </Form>
            ))}
          </div>
        </section>

        <ProblemForm
          initial={problem}
          fields={failure?.fields ?? {}}
          error={failure?.error}
          submitLabel="Save changes"
          hidden={{ intent: "save" }}
        />

        <section className="mt-12 border-t border-[var(--line)] pt-6">
          <h2 className="text-[14px] font-semibold">Delete</h2>
          <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-[var(--muted)]">
            Rooms already started from this problem keep working — each one holds its own copy of the statement and
            tests, so deleting this cannot break a session in progress.
          </p>
          <Form
            method="post"
            className="mt-3"
            onSubmit={(event) => {
              if (!confirm(`Delete "${problem.title}"? This cannot be undone.`)) event.preventDefault();
            }}
          >
            <input type="hidden" name="intent" value="delete" />
            <Button type="submit" variant="danger" size="sm" icon={<TrashIcon size={13} />} data-testid="delete-problem">
              Delete this problem
            </Button>
          </Form>
        </section>
      </main>
    </div>
  );
}
