/**
 * A problem as one full-width row.
 *
 * A grid of cards wastes the horizontal space a problem list has, and makes
 * scanning down a column of titles harder than it needs to be. One line per
 * problem, with the metadata aligned in columns so the eye can run down any of
 * them.
 */

import { Link } from "react-router";
import type { ProblemSummary } from "@/api/types";
import { Badge, DifficultyBadge } from "@/ui/Badge";
import { BeakerIcon, CheckCircleIcon } from "@/ui/Icons";

export interface ProblemRowProps {
  problem: ProblemSummary;
  /** Shows a tick: the viewer has passed every case. */
  solved?: boolean;
  /** Position in the list, shown as a muted index. */
  index?: number;
  /** Rendered at the far right, e.g. a remove button. */
  trailing?: React.ReactNode;
  /**
   * Drops the "Default" badge. Set where the surrounding heading already says
   * so — a badge repeated down every row of a list of shipped problems is
   * decoration, not information.
   */
  impliedOfficial?: boolean;
}

export function ProblemRow({ problem, solved = false, index, trailing, impliedOfficial = false }: ProblemRowProps) {
  return (
    <div className="problem-row-wrap" data-testid={`problem-card-${problem.id}`}>
      <Link to={`/problems/${problem.id}`} className="problem-row-link">
        <span className="problem-row-status" aria-hidden>
          {solved ? (
            <span className="text-[var(--ok)]" title="You solved this">
              <CheckCircleIcon size={16} />
            </span>
          ) : index !== undefined ? (
            <span className="text-[12px] tabular-nums text-[var(--muted)]">{index + 1}</span>
          ) : (
            <span className={`difficulty-dot difficulty-dot-${problem.difficulty}`} />
          )}
          {solved && <span className="sr-only">Solved.</span>}
        </span>

        <span className="problem-row-main">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[14.5px] font-medium leading-snug">{problem.title}</span>
            {problem.official && !impliedOfficial && <Badge tone="brand">Default</Badge>}
            {problem.visibility === "draft" && <Badge tone="warn">Draft</Badge>}
            {problem.visibility === "unlisted" && <Badge tone="neutral">Unlisted</Badge>}
          </span>
          {problem.summary && <span className="problem-row-summary">{problem.summary}</span>}
        </span>

        <span className="problem-row-meta">
          {problem.testCount > 0 && (
            <span className="flex items-center gap-1" title={`${problem.testCount} test cases`}>
              <BeakerIcon size={13} />
              {problem.testCount}
            </span>
          )}
          {/* Only once someone has opened one: "0 rooms" on every row is a
              column of noise that says nothing. */}
          {problem.roomCount > 0 && (
            <span className="hidden sm:inline" title={`${problem.roomCount} rooms started`}>
              {problem.roomCount} {problem.roomCount === 1 ? "room" : "rooms"}
            </span>
          )}
        </span>

        {/* Same reasoning as the badge: in a list whose heading already names
            the author, a column repeating it down every row is noise. */}
        {!impliedOfficial && (
          <span className="problem-row-author">
            {problem.official ? "duckduckcode" : problem.author.displayName}
          </span>
        )}

        <DifficultyBadge level={problem.difficulty} className="problem-row-difficulty" />
      </Link>
      {trailing && <div className="shrink-0 pr-2">{trailing}</div>}
    </div>
  );
}

/** A bordered list of rows, with a heading. */
export function ProblemList({
  title,
  description,
  problems,
  solved,
  action,
  numbered = false,
  testId,
  emptyMessage,
  impliedOfficial = false,
}: {
  title?: string;
  description?: string;
  problems: ProblemSummary[];
  solved?: ReadonlySet<string>;
  action?: React.ReactNode;
  numbered?: boolean;
  testId?: string;
  emptyMessage?: string;
  /** Passed to every row — see `impliedOfficial` on ProblemRow. */
  impliedOfficial?: boolean;
}) {
  if (problems.length === 0 && !emptyMessage) return null;
  return (
    <section className="mt-8" data-testid={testId}>
      {title && (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="section-heading">{title}</h2>
          {action}
        </div>
      )}
      {description && <p className="mt-1 text-[13px] text-[var(--muted)]">{description}</p>}

      {problems.length === 0 ? (
        <p className="mt-3 text-[13px] text-[var(--muted)]">{emptyMessage}</p>
      ) : (
        <div className="problem-list mt-3">
          {problems.map((problem, position) => (
            <ProblemRow
              key={problem.id}
              problem={problem}
              solved={solved?.has(problem.id)}
              index={numbered ? position : undefined}
              impliedOfficial={impliedOfficial}
            />
          ))}
        </div>
      )}
    </section>
  );
}
