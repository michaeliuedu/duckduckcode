/**
 * The contribution grid: a square per day, a column per week.
 *
 * Reads as "have I been doing this?", which is the question a practice tracker
 * exists to answer. Intensity comes from solves first and runs second, so a day
 * spent failing the same case still shows up — showing only successes would
 * make the hardest days look empty.
 */

import { useMemo } from "react";
import type { Progress } from "@/api/types";
import { pluralizeCount } from "@/lib/format";

/** How many weeks of squares to draw. */
const WEEKS = 26;

const DAY_MS = 24 * 60 * 60 * 1000;

interface Square {
  key: string;
  date: Date;
  runs: number;
  solves: number;
  level: 0 | 1 | 2 | 3 | 4;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Buckets a day's work into five shades. */
function level(runs: number, solves: number): Square["level"] {
  if (runs === 0) return 0;
  if (solves >= 3) return 4;
  if (solves >= 1) return 3;
  if (runs >= 4) return 2;
  return 1;
}

/**
 * Builds the grid ending today, starting on the Sunday that keeps it
 * rectangular — otherwise the first column is ragged and the weekday rows stop
 * lining up.
 */
function buildSquares(progress: Progress | null): Square[][] {
  const byDay = new Map(progress?.days.map((day) => [day.day, day]) ?? []);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const end = today.getTime();
  const start = end - (WEEKS * 7 - 1) * DAY_MS;
  const firstSunday = start - new Date(start).getUTCDay() * DAY_MS;

  const columns: Square[][] = [];
  for (let time = firstSunday; time <= end; time += DAY_MS) {
    const date = new Date(time);
    const key = isoDay(date);
    const entry = byDay.get(key);
    const runs = entry?.runs ?? 0;
    const solves = entry?.solves ?? 0;
    const square: Square = { key, date, runs, solves, level: level(runs, solves) };

    if (date.getUTCDay() === 0) columns.push([]);
    columns[columns.length - 1]?.push(square);
  }
  return columns;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function describe(square: Square): string {
  const date = square.date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (square.runs === 0) return `No practice on ${date}`;
  const solved = square.solves > 0 ? `, ${pluralizeCount(square.solves, "solved")}` : "";
  return `${pluralizeCount(square.runs, "test run")}${solved} on ${date}`;
}

export interface ProgressGridProps {
  progress: Progress | null;
  /** Whose grid it is, for the empty state's wording. */
  subject?: "you" | "them";
  className?: string;
}

export function ProgressGrid({ progress, subject = "you", className = "" }: ProgressGridProps) {
  const columns = useMemo(() => buildSquares(progress), [progress]);
  const active = progress?.days.filter((day) => day.runs > 0).length ?? 0;

  return (
    <div className={`progress-grid-wrap ${className}`.trim()} data-testid="progress-grid">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13px] text-[var(--muted)]">
          {active === 0
            ? subject === "you"
              ? "Run a problem's tests and this fills in."
              : "No practice recorded yet."
            : `${pluralizeCount(active, "active day")} in the last ${WEEKS} weeks`}
        </p>
        <Legend />
      </div>

      <div className="progress-grid mt-2.5" role="img" aria-label={gridLabel(progress, active)}>
        <div className="progress-grid-months" aria-hidden>
          {monthLabels(columns).map((label, index) => (
            <span key={index} className="progress-grid-month">
              {label}
            </span>
          ))}
        </div>
        <div className="progress-grid-columns">
          {columns.map((week, index) => (
            <div key={index} className="progress-grid-column">
              {week.map((square) => (
                <span
                  key={square.key}
                  className="progress-square"
                  data-level={square.level}
                  data-testid={square.runs > 0 ? "progress-square-active" : undefined}
                  title={describe(square)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * One label per column, blank except where a month starts.
 *
 * A label is skipped when the previous one is too close to it: a month that
 * begins mid-week would otherwise print "MarApr" over three squares of space.
 */
function monthLabels(columns: Square[][]): string[] {
  const labels: string[] = [];
  let lastLabelled = -MIN_LABEL_GAP;
  for (let index = 0; index < columns.length; index++) {
    const first = columns[index]?.[0];
    const previous = columns[index - 1]?.[0];
    const startsMonth = first && (!previous || previous.date.getUTCMonth() !== first.date.getUTCMonth());
    // Never label the last column either: there is no room to the right of it.
    if (startsMonth && index - lastLabelled >= MIN_LABEL_GAP && index < columns.length - 2) {
      labels.push(MONTHS[first.date.getUTCMonth()] ?? "");
      lastLabelled = index;
    } else {
      labels.push("");
    }
  }
  return labels;
}

/** Columns of clearance a month label needs, in square widths. */
const MIN_LABEL_GAP = 3;

function gridLabel(progress: Progress | null, active: number): string {
  if (!progress || active === 0) return "No practice recorded in the last six months.";
  return `${pluralizeCount(active, "active day")} and ${pluralizeCount(progress.solved, "problem")} solved in the last six months.`;
}

function Legend() {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
      Less
      {[0, 1, 2, 3, 4].map((value) => (
        <span key={value} className="progress-square" data-level={value} aria-hidden />
      ))}
      More
    </span>
  );
}

/** The three numbers worth putting above the grid. */
export function ProgressStats({ progress }: { progress: Progress | null }) {
  const stats = [
    { label: "Solved", value: progress?.solved ?? 0 },
    { label: "Attempted", value: progress?.attempted ?? 0 },
    { label: "Day streak", value: progress?.currentStreak ?? 0 },
  ];
  return (
    <dl className="flex gap-6" data-testid="progress-stats">
      {stats.map((stat) => (
        <div key={stat.label}>
          <dd className="text-[22px] font-semibold leading-none tabular-nums">{stat.value}</dd>
          <dt className="mt-1 text-[12px] text-[var(--muted)]">{stat.label}</dt>
        </div>
      ))}
    </dl>
  );
}
