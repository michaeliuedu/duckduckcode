/**
 * A profile: what someone has been doing, what they have written, and the lists
 * they keep.
 *
 * The same progress grid as the home page, because it answers the same question
 * from the outside — "is this person active?" — and because building a second
 * one would mean two things to keep in step.
 */

import { Link, useLoaderData } from "react-router";
import type { ProfileResponse } from "@/api/types";
import { useCurrentUser } from "@/auth/session";
import { ProblemList } from "@/features/problems/ProblemRow";
import { ProgressGrid, ProgressStats } from "@/features/progress/ProgressGrid";
import { initials, pluralizeCount } from "@/lib/format";
import { AppHeader } from "@/ui/AppHeader";
import { Badge } from "@/ui/Badge";
import { ArrowLeftIcon, PlusIcon } from "@/ui/Icons";

export function ProfilePage() {
  const { profile, problems, lists, progress, solved } = useLoaderData() as ProfileResponse;
  const user = useCurrentUser();
  const isMe = user?.handle === profile.handle;
  const solvedSet = new Set(solved ?? []);

  const joined = new Date(profile.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />
      <main className="page">
        <Link to="/" className="btn btn-quiet btn-sm -ml-2">
          <ArrowLeftIcon size={14} />
          Home
        </Link>

        <section className="hero mt-3" data-testid="profile-header">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex items-center gap-4">
              <span
                aria-hidden
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--chip)] text-[20px] font-semibold text-[var(--ink-soft)]"
              >
                {initials(profile.displayName)}
              </span>
              <div>
                <h1 className="flex flex-wrap items-center gap-2 text-[24px] font-semibold tracking-tight">
                  {profile.displayName}
                  {profile.official && <Badge tone="brand">Official</Badge>}
                </h1>
                <p className="text-[13px] text-[var(--muted)]">
                  @{profile.handle} · joined {joined}
                </p>
                <div className="mt-4">
                  <ProgressStats progress={progress ?? null} />
                </div>
              </div>
            </div>
            <div className="min-w-0 flex-1 lg:max-w-[560px]">
              <ProgressGrid progress={progress ?? null} subject={isMe ? "you" : "them"} />
            </div>
          </div>
        </section>

        <ProblemList
          title={isMe ? "Your problems" : "Problems"}
          problems={problems}
          solved={solvedSet}
          testId="profile-problems"
          emptyMessage={isMe ? "You have not written one yet." : "Nothing published yet."}
          action={
            isMe ? (
              <Link to="/problems/new" className="btn btn-ghost btn-sm">
                <PlusIcon size={13} />
                Write one
              </Link>
            ) : undefined
          }
        />

        {(lists.length > 0 || isMe) && (
          <section className="mt-9" data-testid="profile-lists">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="section-heading">Lists</h2>
              {isMe && (
                <Link to="/lists" className="link text-[13px]">
                  Manage
                </Link>
              )}
            </div>
            {lists.length === 0 ? (
              <p className="mt-2 text-[13px] text-[var(--muted)]">
                {isMe ? "You have not made a list yet." : "No public lists."}
              </p>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {lists.map((list) => (
                  <li key={list.id}>
                    <Link
                      to={`/lists/${list.id}`}
                      className="surface flex items-center gap-3 px-4 py-3 hover:border-[var(--brand)]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium">{list.title}</span>
                        <span className="mt-0.5 block text-[12px] text-[var(--muted)]">
                          {pluralizeCount(list.itemCount, "problem")}
                        </span>
                      </span>
                      {list.visibility !== "public" && <Badge tone="neutral">{list.visibility}</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
