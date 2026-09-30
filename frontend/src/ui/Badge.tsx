/** Small status and difficulty labels. */

import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "brand" | "easy" | "medium" | "hard" | "ok" | "warn" | "error";

const TONES: Record<BadgeTone, string> = {
  neutral: "badge-neutral",
  brand: "badge-brand",
  easy: "badge-easy",
  medium: "badge-medium",
  hard: "badge-hard",
  ok: "badge-ok",
  warn: "badge-warn",
  error: "badge-error",
};

export function Badge({ tone = "neutral", children, className = "" }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return <span className={`badge ${TONES[tone]} ${className}`.trim()}>{children}</span>;
}

function difficultyTone(level: string): BadgeTone {
  if (level === "easy") return "easy";
  if (level === "medium") return "medium";
  if (level === "hard") return "hard";
  return "neutral";
}

/** A problem's difficulty, coloured the way problem sets usually colour it. */
export function DifficultyBadge({ level, className }: { level: string; className?: string }) {
  const label = level.charAt(0).toUpperCase() + level.slice(1);
  return (
    <span className={`text-[13px] font-medium ${`difficulty-${difficultyTone(level)}`} ${className ?? ""}`.trim()}>
      {label}
    </span>
  );
}
