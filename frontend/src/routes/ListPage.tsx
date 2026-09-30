/** One list: the problems in it, and its settings if it is yours. */

import { Form, Link, useLoaderData, useNavigation } from "react-router";
import { ProblemRow } from "@/features/problems/ProblemRow";
import { pluralizeCount } from "@/lib/format";
import { AppHeader } from "@/ui/AppHeader";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { ArrowLeftIcon, TrashIcon } from "@/ui/Icons";
import type { ListLoaderData } from "./loaders";

export function ListPage() {
  const { list, canEdit } = useLoaderData() as ListLoaderData;
  const navigation = useNavigation();
  const items = list.items ?? [];

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />
      <main className="page">
        <Link to={canEdit ? "/lists" : `/u/${list.owner.handle}`} className="btn btn-quiet btn-sm -ml-2">
          <ArrowLeftIcon size={14} />
          {canEdit ? "My lists" : list.owner.displayName}
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-[26px] font-semibold tracking-tight">{list.title}</h1>
          {list.visibility !== "public" && <Badge tone="neutral">{list.visibility}</Badge>}
        </div>
        <p className="mt-1.5 text-[13px] text-[var(--muted)]">
          {pluralizeCount(items.length, "problem")} · by{" "}
          <Link to={`/u/${list.owner.handle}`} className="hover:underline">
            {list.owner.displayName}
          </Link>
        </p>
        {list.description && <p className="mt-3 max-w-2xl text-[14px] leading-relaxed">{list.description}</p>}

        {items.length === 0 ? (
          <p className="mt-8 text-[13px] text-[var(--muted)]">
            Nothing in here yet. Open a problem and use the Add to list button.
          </p>
        ) : (
          <div className="problem-list mt-7">
            {items.map((problem, index) => (
              <ProblemRow
                key={problem.id}
                problem={problem}
                index={index}
                trailing={
                  canEdit ? (
                    <Form method="post">
                      <input type="hidden" name="intent" value="remove" />
                      <input type="hidden" name="problemId" value={problem.id} />
                      <button
                        type="submit"
                        aria-label={`Remove ${problem.title} from this list`}
                        data-testid={`remove-${problem.id}`}
                        className="icon-btn !h-7 !w-7"
                      >
                        <TrashIcon size={13} />
                      </button>
                    </Form>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}

        {canEdit && (
          <section className="mt-12 border-t border-[var(--line)] pt-7">
            <h2 className="text-[15px] font-semibold">List settings</h2>
            <Form method="post" className="mt-4 flex flex-col gap-4" data-testid="list-settings">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="list-title" className="text-[13px] font-medium">
                  Name
                </label>
                <input
                  id="list-title"
                  name="title"
                  defaultValue={list.title}
                  required
                  className="field h-9 text-[14px]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="list-description" className="text-[13px] font-medium">
                  Description
                </label>
                <textarea
                  id="list-description"
                  name="description"
                  defaultValue={list.description}
                  rows={3}
                  className="field h-auto py-2 text-[14px]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="list-visibility" className="text-[13px] font-medium">
                  Who can see it
                </label>
                <select
                  id="list-visibility"
                  name="visibility"
                  defaultValue={list.visibility}
                  className="field h-9 w-56 text-[14px]"
                >
                  <option value="private">Private — only me</option>
                  <option value="unlisted">Unlisted — anyone with the link</option>
                  <option value="public">Public — shown on my profile</option>
                </select>
              </div>
              <div>
                <Button type="submit" variant="primary" busy={navigation.state === "submitting"}>
                  Save
                </Button>
              </div>
            </Form>

            <Form
              method="post"
              className="mt-8"
              onSubmit={(event) => {
                if (!confirm(`Delete the list ${list.title}? The problems in it are not affected.`)) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="intent" value="delete" />
              <Button type="submit" variant="danger" size="sm" icon={<TrashIcon size={13} />} data-testid="delete-list">
                Delete this list
              </Button>
            </Form>
          </section>
        )}
      </main>
    </div>
  );
}
