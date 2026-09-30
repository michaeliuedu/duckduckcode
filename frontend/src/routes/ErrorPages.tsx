/**
 * What every failure looks like.
 *
 * One boundary handles the three cases worth distinguishing: a room that does
 * not exist, a URL that matches nothing, and anything else. `useRevalidator`
 * gives the retry button real behaviour instead of asking people to reload.
 */

import { isRouteErrorResponse, Link, useRevalidator, useRouteError } from "react-router";
import { AppHeader } from "@/ui/AppHeader";
import { Button } from "@/ui/Button";
import { ArrowLeftIcon } from "@/ui/Icons";
import type { RouteFailure } from "./loaders";

interface Described {
  title: string;
  detail: string;
  /** Retrying a 404 is pointless. */
  retryable: boolean;
}

function describe(error: unknown): Described {
  if (isRouteErrorResponse(error)) {
    const payload = error.data as Partial<RouteFailure> | undefined;
    if (payload?.notFound || error.status === 404) {
      // One boundary covers rooms, problems and lists, so the wording has to
      // fit all three. It also has to fit "exists but is not yours", which is
      // reported as a 404 on purpose: a different message would confirm that
      // someone else's draft is there.
      return {
        title: "Not found",
        detail:
          "The link may be mistyped, or whatever it pointed at was deleted, was never published, or belongs to someone else.",
        retryable: false,
      };
    }
    return {
      title: "Could not load that",
      detail: payload?.message ?? `The server replied ${error.status}.`,
      retryable: true,
    };
  }
  if (error instanceof Error) {
    return { title: "Something went wrong", detail: error.message, retryable: true };
  }
  return { title: "Something went wrong", detail: "An unexpected error stopped the page from loading.", retryable: true };
}

function FailurePage({ title, detail, retryable }: Described) {
  const revalidator = useRevalidator();

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-md text-[14px] leading-relaxed text-[var(--muted)]">{detail}</p>
        <div className="mt-7 flex items-center gap-2">
          <Link to="/" className="btn btn-primary btn-md">
            <ArrowLeftIcon />
            Back to problems
          </Link>
          {retryable && (
            <Button variant="ghost" busy={revalidator.state === "loading"} onClick={() => void revalidator.revalidate()}>
              Try again
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}

/** Boundary for any route that loads data. */
export function RouteErrorBoundary() {
  return <FailurePage {...describe(useRouteError())} />;
}

/** Shown for a URL that matches no route at all. */
export function NotFoundPage() {
  return (
    <FailurePage
      title="Page not found"
      detail="That URL doesn’t match anything here. Problems live at /problems/<name> and rooms at /rooms/<id>."
      retryable={false}
    />
  );
}

/** The first paint while the initial route's data is still in flight. */
export function AppLoading() {
  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />
      <main className="flex flex-1 items-center justify-center">
        <p className="text-[13px] text-[var(--muted)]">Loading…</p>
      </main>
    </div>
  );
}
