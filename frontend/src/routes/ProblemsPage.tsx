/** Browse and search. The URL holds the query, so a search is shareable. */

import { Link, useLoaderData, useSearchParams } from "react-router";
import { useCurrentUser } from "@/auth/session";
import { ProblemRow } from "@/features/problems/ProblemRow";
import { pluralizeCount } from "@/lib/format";
import { AppHeader } from "@/ui/AppHeader";
import { ArrowLeftIcon, PlusIcon } from "@/ui/Icons";
import { SearchBar } from "@/features/problems/SearchBar";
import type { ProblemsLoaderData } from "./loaders";

const SORTS = [
  { value: "popular", label: "Most used" },
  { value: "recent", label: "Newest" },
  { value: "relevance", label: "Best match" },
] as const;

const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export function ProblemsPage() {
  const { problems, search } = useLoaderData() as ProblemsLoaderData;
  const [params, setParams] = useSearchParams();
  const user = useCurrentUser();

  const heading = search.q ? `Results for “${search.q}”` : search.author ? `Problems by @${search.author}` : "All problems";

  /** Toggles one filter, keeping the rest of the query intact. */
  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || next.get(key) === value) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />
      <main className="page">
        <Link to="/" className="btn btn-quiet btn-sm -ml-2">
          <ArrowLeftIcon size={14} />
          Home
        </Link>
        <h1 className="mt-3 text-[26px] font-semibold tracking-tight">{heading}</h1>

        <SearchBar defaultValue={search.q ?? ""} className="flex-1" />

        <div className="mt-4 flex flex-wrap items-center gap-1.5" data-testid="filters">
          {DIFFICULTIES.map((level) => (
            <button
              key={level}
              type="button"
              className={params.get("difficulty") === level ? "chip chip-active" : "chip"}
              aria-pressed={params.get("difficulty") === level}
              data-testid={`filter-${level}`}
              onClick={() => setFilter("difficulty", level)}
            >
              {level[0]!.toUpperCase() + level.slice(1)}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-[var(--line)]" aria-hidden />
          <button
            type="button"
            className={params.get("official") === "true" ? "chip chip-active" : "chip"}
            aria-pressed={params.get("official") === "true"}
            data-testid="filter-official"
            onClick={() => setFilter("official", "true")}
          >
            Default only
          </button>
          <span className="mx-1 h-4 w-px bg-[var(--line)]" aria-hidden />
          {SORTS.map((sort) => (
            <button
              key={sort.value}
              type="button"
              className={(params.get("sort") ?? (search.q ? "relevance" : "popular")) === sort.value ? "chip chip-active" : "chip"}
              aria-pressed={(params.get("sort") ?? (search.q ? "relevance" : "popular")) === sort.value}
              data-testid={`sort-${sort.value}`}
              onClick={() => setFilter("sort", sort.value)}
            >
              {sort.label}
            </button>
          ))}
        </div>

        <p className="mt-5 text-[13px] text-[var(--muted)]" data-testid="result-count">
          {pluralizeCount(problems.length, "problem")}
        </p>

        {problems.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-[var(--line-strong)] px-6 py-10 text-center">
            <p className="text-[14px] font-medium">Nothing matches that.</p>
            <p className="mt-1.5 text-[13px] text-[var(--muted)]">
              Try fewer words, or drop a filter. Search covers titles, summaries and statements.
            </p>
            <Link
              to={user ? "/problems/new" : "/login?next=%2Fproblems%2Fnew"}
              className="btn btn-primary btn-md mt-5"
            >
              <PlusIcon size={14} />
              Write this one yourself
            </Link>
          </div>
        ) : (
          <div className="problem-list mt-4">
            {problems.map((problem) => (
              <ProblemRow key={problem.id} problem={problem} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
