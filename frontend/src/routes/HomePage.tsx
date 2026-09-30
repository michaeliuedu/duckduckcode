/**
 * The front page: see how you are doing, then find something to work on.
 *
 * For a signed-in person the banner leads with their own progress, because
 * "what have I been doing" is the question they open the app with. For everyone
 * else it explains what the app is. Below that: the problems that ship with it,
 * then what people actually use, then what is new.
 */

import { Form, Link, useLoaderData, useNavigation } from "react-router";
import { useCurrentUser } from "@/auth/session";
import { ProblemList } from "@/features/problems/ProblemRow";
import { ProgressGrid, ProgressStats } from "@/features/progress/ProgressGrid";
import { AppHeader } from "@/ui/AppHeader";
import { Button } from "@/ui/Button";
import { PlusIcon, SearchIcon } from "@/ui/Icons";
import { Spinner } from "@/ui/Spinner";
import type { HomeLoaderData } from "./loaders";

export function HomePage() {
  const { feed } = useLoaderData() as HomeLoaderData;
  const user = useCurrentUser();
  const navigation = useNavigation();
  const creatingBlank = navigation.formData?.get("mode") === "blank";
  const solved = new Set(feed.solved ?? []);

  const empty = feed.official.length === 0 && feed.popular.length === 0 && feed.recent.length === 0;

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />
      <main className="page">
        {user ? (
          <section className="hero" data-testid="hero-progress">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="text-[13px] text-[var(--muted)]">Welcome back</p>
                <h1 className="mt-0.5 text-[26px] font-semibold tracking-tight">{user.displayName}</h1>
                <div className="mt-5">
                  <ProgressStats progress={feed.progress ?? null} />
                </div>
              </div>
              <div className="min-w-0 flex-1 lg:max-w-[560px]">
                <ProgressGrid progress={feed.progress ?? null} />
              </div>
            </div>
          </section>
        ) : (
          <section className="hero" data-testid="hero-intro">
            <h1 className="max-w-2xl text-[30px] font-semibold leading-tight tracking-tight">
              Practice problems you can work through together
            </h1>
            <p className="mt-2.5 max-w-2xl text-[14.5px] leading-relaxed text-[var(--muted)]">
              Share one link and edit the same Python file in real time, with live cursors. Run it in the browser, step
              through it line by line, and check it against the author's test cases. Every problem here was written by
              someone — and you can write one too.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Link to="/signup" className="btn btn-primary btn-md">
                Create an account
              </Link>
              <Form method="post" action="/rooms/new">
                <input type="hidden" name="mode" value="blank" />
                <Button type="submit" variant="ghost" busy={creatingBlank} data-testid="choose-blank">
                  Open a blank workspace
                </Button>
              </Form>
            </div>
          </section>
        )}

        {/* Search on the left, actions on the right. Previously all four sat in
            one undifferentiated row, so finding a problem and starting one
            competed for the same attention. */}
        <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2">
          <SearchBar className="w-full max-w-[26rem] sm:w-auto sm:flex-1" />
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <Link
              to={user ? "/problems/new" : "/login?next=%2Fproblems%2Fnew"}
              className="btn btn-primary btn-md"
              data-testid="write-a-problem"
            >
              <PlusIcon size={14} />
              Write a problem
            </Link>
            {user && (
              <>
                <Form method="post" action="/rooms/new">
                  <input type="hidden" name="mode" value="blank" />
                  <Button type="submit" variant="ghost" busy={creatingBlank} data-testid="choose-blank">
                    Blank workspace
                  </Button>
                </Form>
                <Link to="/lists" className="btn btn-quiet btn-md" data-testid="my-lists-link">
                  My lists
                </Link>
              </>
            )}
          </div>
        </div>

        {empty ? (
          <EmptyState signedIn={user !== null} />
        ) : (
          <>
            <ProblemList
              title="Default problems"
              description="Shipped with duckduckcode, each with test cases."
              problems={feed.official}
              solved={solved}
              numbered
              impliedOfficial
              testId="section-official"
              action={
                <Link to="/problems?official=true" className="text-[13px] font-medium text-[var(--brand)]">
                  See all
                </Link>
              }
            />
            <ProblemList
              title="Popular"
              description="The community problems most often opened in a room."
              problems={feed.popular}
              solved={solved}
              testId="section-popular"
              action={
                <Link to="/problems?sort=popular" className="text-[13px] font-medium text-[var(--brand)]">
                  Browse all
                </Link>
              }
            />
            <ProblemList
              title="Recently published"
              problems={feed.recent}
              solved={solved}
              testId="section-recent"
              action={
                <Link to="/problems?sort=recent" className="text-[13px] font-medium text-[var(--brand)]">
                  Browse all
                </Link>
              }
            />
          </>
        )}
      </main>
    </div>
  );
}

/** Submits to /problems as a GET, so a search is a shareable URL. */
export function SearchBar({ defaultValue = "", className = "" }: { defaultValue?: string; className?: string }) {
  const navigation = useNavigation();
  const searching = navigation.state === "loading" && navigation.location?.pathname === "/problems";

  return (
    <Form method="get" action="/problems" className={`flex min-w-[240px] gap-2 ${className}`.trim()} data-testid="search-form">
      <div className="relative flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
          <SearchIcon size={15} />
        </span>
        <input
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder="Search problems — graphs, strings, recursion…"
          aria-label="Search problems"
          data-testid="search-input"
          className="field h-10 w-full pl-9 text-[14px]"
        />
      </div>
      <Button type="submit" variant="ghost" busy={searching}>
        Search
      </Button>
    </Form>
  );
}

function EmptyState({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="mt-10 rounded-xl border border-dashed border-[var(--line-strong)] px-6 py-12 text-center">
      <p className="text-[15px] font-medium">No problems yet.</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-[var(--muted)]">
        The default problems are added when the backend starts. If this is a fresh database and it is still empty, check
        the backend logs.
      </p>
      <Link to={signedIn ? "/problems/new" : "/signup"} className="btn btn-primary btn-md mt-5">
        {signedIn ? "Write the first one" : "Create an account to write one"}
      </Link>
    </div>
  );
}

/** Shown while the feed loads on a cold start. */
export function HomeSkeleton() {
  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />
      <main className="flex flex-1 items-center justify-center gap-2 text-[13px] text-[var(--muted)]">
        <Spinner />
        Loading problems…
      </main>
    </div>
  );
}
