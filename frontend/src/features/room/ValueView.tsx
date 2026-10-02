/**
 * Drawing a Python value.
 *
 * The tracer sends the shape of a container rather than only its `repr`, so a
 * list can be a row of numbered cells instead of a string of text. That is the
 * whole point: the questions people actually have while stepping through an
 * algorithm are positional — which cell did that write to, where are `left` and
 * `right` now, is this row the one being scanned — and a repr answers none of
 * them.
 *
 * Every view here is deliberately flat. Cells hold reprs the tracer already
 * shortened, so nothing recurses and nothing can grow without bound.
 */

import { useState } from "react";
import {
  changedCells,
  pointersInto,
  type IndexPointer,
  type TraceLocal,
  type TraceValue,
} from "@/python/trace";

export function ValueView({
  value,
  previous,
  locals,
  name,
}: {
  value: TraceValue;
  previous: TraceValue | undefined;
  locals: readonly TraceLocal[];
  name: string;
}) {
  const changed = changedCells(value, previous);

  switch (value.t) {
    case "seq":
      return <CellRow cells={value.items} total={value.n} changed={changed} pointers={pointersInto(value, locals, name)} />;
    case "text":
      return (
        <CellRow
          cells={value.chars}
          total={value.n}
          changed={changed}
          pointers={pointersInto(value, locals, name)}
          monospaceCells
        />
      );
    case "set":
      return <CellRow cells={value.items} total={value.n} changed={changed} pointers={[]} unordered />;
    case "map":
      return <MapView value={value} changed={changed} />;
    case "grid":
      return <GridView value={value} changed={changed} />;
    case "graph":
      return <GraphView value={value} />;
  }
}

/**
 * A sequence as numbered cells, with any cursors pointing at them.
 *
 * The index is what makes this worth more than the repr, so it is always shown
 * — except for a set, which has no meaningful order to number.
 */
function CellRow({
  cells,
  total,
  changed,
  pointers,
  unordered = false,
  monospaceCells = false,
}: {
  cells: string[];
  total: number;
  changed: Set<number>;
  pointers: IndexPointer[];
  unordered?: boolean;
  monospaceCells?: boolean;
}) {
  if (total === 0) return <Empty />;

  // A cursor may sit one past the end, which needs a column to sit under.
  const beyond = pointers.some((pointer) => pointer.at >= cells.length);
  const columns = cells.length + (beyond ? 1 : 0);

  return (
    <div className="mt-1 overflow-x-auto pb-0.5">
      <div className="flex w-max gap-1">
        {Array.from({ length: columns }, (_, position) => {
          const present = position < cells.length;
          const here = pointers.filter((pointer) => pointer.at === position);
          return (
            <div key={position} className="flex flex-col items-center gap-0.5" data-cell-index={position}>
              {!unordered && <span className="cell-index">{position}</span>}
              {present ? (
                <span
                  className={`val-cell ${changed.has(position) ? "val-cell-changed" : ""}`.trim()}
                  data-changed={changed.has(position) ? "true" : undefined}
                >
                  {monospaceCells ? displayChar(cells[position]!) : cells[position]}
                </span>
              ) : (
                <span className="val-cell val-cell-ghost" aria-hidden />
              )}
              <span className="flex h-3.5 items-start gap-0.5">
                {here.map((pointer) => (
                  <span key={pointer.name} className="cell-pointer" data-pointer={pointer.name}>
                    {pointer.name}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
        {total > cells.length && <More extra={total - cells.length} />}
      </div>
    </div>
  );
}

/** A space in a character cell needs something to occupy it. */
function displayChar(char: string): string {
  return char === " " ? "␣" : char;
}

/** A mapping as key → value rows, which is how anyone reads a lookup table. */
function MapView({ value, changed }: { value: TraceValue & { t: "map" }; changed: Set<number> }) {
  if (value.n === 0) return <Empty />;
  return (
    <div className="mt-1 overflow-x-auto">
      <table className="val-map">
        <tbody>
          {value.entries.map(([key, item], position) => (
            <tr key={key} data-changed={changed.has(position) ? "true" : undefined}>
              <td className="val-map-key">{key}</td>
              <td className="val-map-arrow" aria-hidden>
                →
              </td>
              <td className="val-map-value">{item}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {value.n > value.entries.length && (
        <p className="mt-1 text-[11px] text-[var(--muted)]">+{value.n - value.entries.length} more</p>
      )}
    </div>
  );
}

/**
 * A rectangular list of lists as a grid, with row and column numbers.
 *
 * Also the place a 2D list can be re-read as a graph: an adjacency list is a
 * list of neighbour lists, and it is indistinguishable from a matrix until you
 * know which one the program meant. So the grid stays the default and the graph
 * is offered, rather than guessed at.
 */
function GridView({ value, changed }: { value: TraceValue & { t: "grid" }; changed: Set<number> }) {
  const [asGraph, setAsGraph] = useState(false);
  const width = value.rows[0]?.length ?? 0;
  const graph = asGraph ? adjacencyFromRows(value.rows) : null;

  return (
    <div className="mt-1">
      {graph ? <GraphView value={graph} /> : <GridTable rows={value.rows} width={width} changed={changed} />}
      {adjacencyFromRows(value.rows) && (
        <button
          type="button"
          onClick={() => setAsGraph(!asGraph)}
          className="link mt-1 text-[11px]"
          data-testid="grid-as-graph"
        >
          {asGraph ? "Show as grid" : "Read as a graph"}
        </button>
      )}
    </div>
  );
}

function GridTable({ rows, width, changed }: { rows: string[][]; width: number; changed: Set<number> }) {
  return (
    <div className="overflow-x-auto pb-0.5">
      <table className="val-grid">
        <thead>
          <tr>
            <th aria-hidden />
            {Array.from({ length: width }, (_, column) => (
              <th key={column} className="cell-index font-normal">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, y) => (
            <tr key={y}>
              <th className="cell-index font-normal">{y}</th>
              {row.map((item, x) => (
                <td
                  key={x}
                  className={`val-cell ${changed.has(y * width + x) ? "val-cell-changed" : ""}`.trim()}
                  data-changed={changed.has(y * width + x) ? "true" : undefined}
                >
                  {item}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Reads a list of lists as an adjacency list, or returns null.
 *
 * Every entry has to be a row index for this to mean anything as a graph.
 */
function adjacencyFromRows(rows: string[][]): (TraceValue & { t: "graph" }) | null {
  const nodes = rows.map((_, index) => String(index));
  const known = new Set(nodes);
  const edges: [string, string][] = [];
  for (let from = 0; from < rows.length; from++) {
    for (const target of rows[from]!) {
      if (!known.has(target)) return null;
      edges.push([String(from), target]);
    }
  }
  return edges.length > 0 ? { t: "graph", nodes, edges } : null;
}

/**
 * A graph as nodes on a circle.
 *
 * A circle rather than a force simulation: it is deterministic, so the same
 * graph looks the same on both screens and does not rearrange itself between
 * steps — which matters a great deal when two people are talking about it and
 * pointing. It is a poor layout for a large graph, but a large graph does not
 * fit in this panel anyway.
 *
 * A pair of opposite edges is drawn once, curved, with arrowheads at both ends,
 * so an undirected graph stored as two directed edges does not look like a
 * doubled line.
 */
function GraphView({ value }: { value: TraceValue & { t: "graph" } }) {
  const { nodes, edges } = value;
  const size = 200;
  const centre = size / 2;
  const radius = nodes.length === 1 ? 0 : size / 2 - 26;

  const at = new Map(
    nodes.map((node, index) => {
      const angle = (index / nodes.length) * Math.PI * 2 - Math.PI / 2;
      return [node, { x: centre + radius * Math.cos(angle), y: centre + radius * Math.sin(angle) }] as const;
    }),
  );

  const drawn = new Set<string>();
  const links: { from: string; to: string; both: boolean }[] = [];
  for (const [from, to] of edges) {
    if (from === to) continue;
    const key = [from, to].sort().join("\u0000");
    if (drawn.has(key)) continue;
    drawn.add(key);
    links.push({ from, to, both: edges.some(([a, b]) => a === to && b === from) });
  }
  const loops = new Set(edges.filter(([from, to]) => from === to).map(([from]) => from));

  return (
    <div className="mt-1" data-testid="value-graph">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-[200px] w-[200px] max-w-full" role="img" aria-label={`Graph of ${nodes.length} nodes and ${edges.length} edges`}>
        <defs>
          <marker id="ddc-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0.5 L8 4 L0 7.5 Z" fill="var(--muted)" />
          </marker>
        </defs>
        {links.map(({ from, to, both }) => {
          const a = at.get(from)!;
          const b = at.get(to)!;
          return (
            <line
              key={`${from}-${to}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--line-strong)"
              strokeWidth={1.5}
              markerEnd="url(#ddc-arrow)"
              markerStart={both ? "url(#ddc-arrow)" : undefined}
            />
          );
        })}
        {nodes.map((node) => {
          const point = at.get(node)!;
          return (
            <g key={node}>
              {loops.has(node) && (
                <circle cx={point.x} cy={point.y - 15} r={8} fill="none" stroke="var(--line-strong)" strokeWidth={1.5} />
              )}
              <circle cx={point.x} cy={point.y} r={13} fill="var(--brand-soft)" stroke="var(--brand)" strokeWidth={1.5} />
              <text
                x={point.x}
                y={point.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-[var(--ink)] font-mono text-[10px]"
              >
                {node.length > 4 ? `${node.slice(0, 3)}…` : node}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-[11px] text-[var(--muted)]">
        {nodes.length} nodes · {edges.length} edges
      </p>
    </div>
  );
}

function Empty() {
  return <p className="mt-1 text-[12px] text-[var(--muted)]">(empty)</p>;
}

function More({ extra }: { extra: number }) {
  return (
    <span className="self-center pl-1 text-[11px] whitespace-nowrap text-[var(--muted)]" data-testid="value-more">
      +{extra} more
    </span>
  );
}
