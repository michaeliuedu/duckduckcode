/** Your lists. */

import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { pluralizeCount } from "@/lib/format";
import { AppHeader } from "@/ui/AppHeader";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { Field, FormError } from "@/ui/Field";
import { ArrowLeftIcon } from "@/ui/Icons";
import type { FormFailure } from "./authActions";
import type { ListsLoaderData } from "./loaders";

export function ListsPage() {
  const { lists } = useLoaderData() as ListsLoaderData;
  const result = useActionData();
  const failure = result && typeof result === "object" && "error" in result ? (result as FormFailure) : undefined;
  const navigation = useNavigation();

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />
      <main className="page-narrow">
        <Link to="/" className="btn btn-quiet btn-sm -ml-2">
          <ArrowLeftIcon size={14} />
          Home
        </Link>
        <h1 className="mt-3 text-[26px] font-semibold tracking-tight">My lists</h1>
        <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-[var(--muted)]">
          A list is a set of problems in an order you chose — a week of practice, or the four things to try before
          moving on.
        </p>

        <Form method="post" className="mt-6 flex flex-wrap items-end gap-2" data-testid="new-list-form">
          {failure && (
            <div className="w-full">
              <FormError>{failure.error}</FormError>
            </div>
          )}
          <div className="min-w-[240px] flex-1">
            <Field
              label="New list"
              name="title"
              required
              maxLength={120}
              placeholder="Week 3 — graphs"
              error={failure?.fields.title}
            />
          </div>
          <Button type="submit" variant="primary" busy={navigation.state === "submitting"} data-testid="create-list">
            Create
          </Button>
        </Form>

        {lists.length === 0 ? (
          <p className="mt-8 text-[13px] text-[var(--muted)]">Nothing yet.</p>
        ) : (
          <ul className="mt-8 space-y-2">
            {lists.map((list) => (
              <li key={list.id}>
                <Link
                  to={`/lists/${list.id}`}
                  className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-3 hover:border-[var(--brand)]"
                  data-testid={`list-${list.slug}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{list.title}</span>
                    <span className="mt-0.5 block text-[12px] text-[var(--muted)]">
                      {pluralizeCount(list.itemCount, "problem")}
                    </span>
                  </span>
                  {list.visibility !== "private" && <Badge tone="neutral">{list.visibility}</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
