/**
 * The problem statement.
 *
 * Read-only prose, so the only real work here is typography that survives being
 * dragged narrow: paragraphs at a comfortable measure, examples in a card, and
 * inline code that does not overflow the pane.
 */

import type { Problem, ProblemExample } from "@/api/types";
import { languageLabel } from "@/lib/format";
import { DifficultyBadge } from "@/ui/Badge";
import { Markdown } from "@/ui/Markdown";
import { Panel, PanelBar, PanelBody } from "@/ui/Panel";

export function ProblemPanel({ problem }: { problem: Problem }) {
  return (
    <Panel testId="problem-panel" label="Problem description">
      <PanelBar>
        <span className="tab tab-active">Description</span>
        <span className="ml-auto pr-1 text-[12px] text-[var(--muted)]">{languageLabel(problem.language)}</span>
      </PanelBar>
      <PanelBody className="px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-[20px] font-semibold tracking-tight">{problem.title}</h2>
          <DifficultyBadge level={problem.difficulty} />
        </div>

        {/* Markdown written by another member, so it goes through the sanitiser. */}
        <Markdown source={problem.statement} className="mt-4" />

        {problem.examples.length > 0 && (
          <>
            <h3 className="mt-7 text-[13px] font-semibold">Examples</h3>
            <ol className="mt-2 space-y-3">
              {problem.examples.map((example, index) => (
                <li key={index}>
                  <Example example={example} index={index} />
                </li>
              ))}
            </ol>
          </>
        )}
      </PanelBody>
    </Panel>
  );
}

function Example({ example, index }: { example: ProblemExample; index: number }) {
  return (
    <div className="rounded-md bg-[var(--chip)] px-3 py-2.5 text-[13px]">
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
      {example.explanation && <p className="mt-2 leading-relaxed text-[var(--muted)]">{example.explanation}</p>}
    </div>
  );
}
