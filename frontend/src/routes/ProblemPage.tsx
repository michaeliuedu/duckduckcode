/** One problem: read it, start a room from it, or save it to a list. */

import { Form, Link, useLoaderData, useNavigation } from "react-router";
import type { Problem } from "@/api/types";
import { useCurrentUser } from "@/auth/session";
import { AddToListMenu } from "@/features/lists/AddToListMenu";
import { pluralizeCount } from "@/lib/format";
import { AppHeader } from "@/ui/AppHeader";
import { Badge, DifficultyBadge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { ArrowLeftIcon, BeakerIcon, EditIcon, PlayIcon } from "@/ui/Icons";
import { Markdown } from "@/ui/Markdown";
import type { ProblemLoaderData } from "./loaders";

export function ProblemPage() {
  const { problem, canEdit } = useLoaderData() as ProblemLoaderData;
  const user = useCurrentUser();
  const navigation = useNavigation();
  const starting = navigation.formData?.get("problemId") === problem.id;

  const visibleTests = problem.tests.filter((test) => !test.hidden);
  const hiddenCount = problem.tests.length - visibleTests.length;

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />
      <main className="page-narrow">
        <Link to="/" className="btn btn-quiet btn-sm -ml-2">
          <ArrowLeftIcon size={14} />
          Problems
        </Link>

        <header className="mt-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-[26px] font-semibold tracking-tight" data-testid="problem-title">
              {problem.title}
            </h1>
            <DifficultyBadge level={problem.difficulty} />
            {problem.official && <Badge tone="brand">Default</Badge>}
            {problem.visibility === "draft" && <Badge tone="warn">Draft — only you can see this</Badge>}
            {problem.visibility === "unlisted" && <Badge tone="neutral">Unlisted</Badge>}
          </div>
          <p className="mt-2 text-[13px] text-[var(--muted)]">
            {problem.official ? (
              "Ships with duckduckcode"
            ) : (
              <>
                by{" "}
                <Link to={`/u/${problem.author.handle}`} className="font-medium text-[var(--ink-soft)] hover:underline">
                  {problem.author.displayName}
                </Link>
              </>
            )}
            {problem.roomCount > 0 && <> · opened in {pluralizeCount(problem.roomCount, "room")}</>}
            {problem.tests.length > 0 && <> · {pluralizeCount(problem.tests.length, "test case")}</>}
          </p>
        </header>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Form method="post" action="/rooms/new">
            <input type="hidden" name="mode" value="practice" />
            <input type="hidden" name="problemId" value={problem.id} />
            <Button type="submit" variant="run" icon={<PlayIcon />} busy={starting} data-testid="start-room">
              Start a room
            </Button>
          </Form>
          {user && <AddToListMenu problemId={problem.id} />}
          {canEdit && (
            <Link to={`/problems/${problem.id}/edit`} className="btn btn-ghost btn-md" data-testid="edit-problem">
              <EditIcon size={14} />
              Edit
            </Link>
          )}
        </div>

        {problem.summary && <p className="mt-8 text-[15px] leading-relaxed text-[var(--ink-soft)]">{problem.summary}</p>}

        <section className="mt-6">
          <Markdown source={problem.statement} />
        </section>

        {problem.examples.length > 0 && (
          <section className="mt-9">
            <h2 className="text-[15px] font-semibold">Examples</h2>
            <ol className="mt-3 space-y-3">
              {problem.examples.map((example, index) => (
                <li key={index} className="rounded-md bg-[var(--chip)] px-3.5 py-3 text-[13px]">
                  <p className="font-semibold">Example {index + 1}</p>
                  <dl className="mt-1.5 space-y-1 font-mono text-[12.5px]">
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-[var(--muted)]">Input:</dt>
                      <dd className="min-w-0 break-all">{example.input}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-[var(--muted)]">Output:</dt>
                      <dd className="min-w-0 break-all">{example.output}</dd>
                    </div>
                  </dl>
                  {example.explanation && (
                    <p className="mt-2 leading-relaxed text-[var(--muted)]">{example.explanation}</p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {problem.tests.length > 0 && <TestSummary problem={problem} hiddenCount={hiddenCount} />}
      </main>
    </div>
  );
}

function TestSummary({ problem, hiddenCount }: { problem: Problem; hiddenCount: number }) {
  const visible = problem.tests.filter((test) => !test.hidden);
  return (
    <section className="mt-9" data-testid="test-summary">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">
        <BeakerIcon size={15} />
        Test cases
      </h2>
      <p className="mt-1 text-[13px] text-[var(--muted)]">
        Pressing Test in a room calls{" "}
        <code className="rounded bg-[var(--chip)] px-1.5 py-0.5 font-mono text-[12px]">{problem.entryPoint}</code> with
        each case's arguments.
        {hiddenCount > 0 && ` ${pluralizeCount(hiddenCount, "case")} ${hiddenCount === 1 ? "is" : "are"} hidden.`}
      </p>
      {visible.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {visible.map((test, index) => (
            <li key={index} className="rounded-md border border-[var(--line)] px-3 py-2 font-mono text-[12.5px]">
              <span className="text-[var(--muted)]">{problem.entryPoint}(</span>
              {test.args.map((arg) => JSON.stringify(arg)).join(", ")}
              <span className="text-[var(--muted)]">) → </span>
              {JSON.stringify(test.expected)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
