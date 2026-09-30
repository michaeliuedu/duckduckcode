/**
 * Two panes and a divider you can drag, nudge with the keyboard, double-click to
 * reset, or collapse entirely.
 *
 * The size lives in one number (see `splitModel`), persisted per split so the
 * workspace comes back the way it was left. The divider is a real
 * `role="separator"` with `aria-valuenow`, so it is operable without a mouse —
 * arrow keys move it, Home/End go to the extremes, Enter restores the default.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useElementSize } from "@/lib/hooks";
import { readString, writeString } from "@/lib/storage";
import {
  acceptFraction,
  clampFraction,
  fractionBounds,
  fractionFromPosition,
  firstPaneSize,
  hasRoomForBoth,
  nudgeFraction,
  separatorValue,
  type SplitConstraints,
} from "./splitModel";

export type SplitDirection = "horizontal" | "vertical";

/** Which pane is hidden, if either. */
export type CollapsedPane = "first" | "second" | null;

export interface SplitPaneProps {
  /** "horizontal" puts the panes side by side; "vertical" stacks them. */
  direction: SplitDirection;
  first: ReactNode;
  second: ReactNode;
  /** Persists the divider position under this name. Omit for a transient split. */
  storageKey?: string;
  defaultFraction?: number;
  minFirst?: number;
  minSecond?: number;
  collapsed?: CollapsedPane;
  /** Names the panes for assistive technology, e.g. ["Problem", "Code"]. */
  labels?: [string, string];
  className?: string;
  testId?: string;
}

const DIVIDER_SIZE = 8;
const KEYBOARD_STEP = 24;
const KEYBOARD_STEP_LARGE = 96;
const STORAGE_PREFIX = "duckduckcode.layout.";

function readStoredFraction(storageKey: string | undefined, fallback: number): number {
  if (!storageKey) return fallback;
  return acceptFraction(readString(STORAGE_PREFIX + storageKey)) ?? fallback;
}

export function SplitPane({
  direction,
  first,
  second,
  storageKey,
  defaultFraction = 0.5,
  minFirst = 180,
  minSecond = 180,
  collapsed = null,
  labels = ["First pane", "Second pane"],
  className,
  testId,
}: SplitPaneProps) {
  const axis = direction === "horizontal" ? "width" : "height";
  const [containerRef, total] = useElementSize(axis);
  const [fraction, setFractionState] = useState(() => readStoredFraction(storageKey, defaultFraction));
  const [dragging, setDragging] = useState(false);
  const separatorRef = useRef<HTMLDivElement | null>(null);
  const separatorId = useId();

  const constraints: SplitConstraints = useMemo(
    () => ({ total, minFirst, minSecond, dividerSize: DIVIDER_SIZE }),
    [total, minFirst, minSecond],
  );

  const commit = useCallback(
    (next: number) => {
      const clamped = clampFraction(next, constraints);
      setFractionState(clamped);
      if (storageKey) writeString(STORAGE_PREFIX + storageKey, clamped.toFixed(4));
    },
    [constraints, storageKey],
  );

  const positionFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const box = separatorRef.current?.parentElement?.getBoundingClientRect();
      if (!box) return null;
      return direction === "horizontal" ? clientX - box.left : clientY - box.top;
    },
    [direction],
  );

  // While the divider is held, the whole page adopts the resize cursor and stops
  // selecting text — otherwise dragging over the editor highlights code.
  useEffect(() => {
    if (!dragging) return;
    const token = direction === "horizontal" ? "is-resizing-x" : "is-resizing-y";
    document.body.classList.add(token);
    return () => document.body.classList.remove(token);
  }, [dragging, direction]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const position = positionFromEvent(event.clientX, event.clientY);
    if (position === null) return;
    commit(fractionFromPosition(position, constraints));
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const back = direction === "horizontal" ? "ArrowLeft" : "ArrowUp";
    const forward = direction === "horizontal" ? "ArrowRight" : "ArrowDown";
    const step = event.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
    const bounds = fractionBounds(constraints);

    switch (event.key) {
      case back:
        commit(nudgeFraction(fraction, -step, constraints));
        break;
      case forward:
        commit(nudgeFraction(fraction, step, constraints));
        break;
      case "Home":
        commit(bounds.min);
        break;
      case "End":
        commit(bounds.max);
        break;
      case "Enter":
      case " ":
        commit(defaultFraction);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const stackClass = direction === "horizontal" ? "flex-row" : "flex-col";

  if (collapsed === "first") {
    return (
      <div ref={containerRef} className={`flex min-h-0 min-w-0 ${stackClass} ${className ?? ""}`} data-testid={testId}>
        <div className="flex min-h-0 min-w-0 flex-1">{second}</div>
      </div>
    );
  }
  if (collapsed === "second") {
    return (
      <div ref={containerRef} className={`flex min-h-0 min-w-0 ${stackClass} ${className ?? ""}`} data-testid={testId}>
        <div className="flex min-h-0 min-w-0 flex-1">{first}</div>
      </div>
    );
  }

  // Before the container has been measured, and when it is too small for both
  // minimums, fall back to an even flex split rather than a wrong pixel size.
  const measured = total > 0 && hasRoomForBoth(constraints);
  const firstStyle = measured
    ? { flex: `0 0 ${firstPaneSize(fraction, constraints)}px` }
    : { flex: "1 1 0%" };

  return (
    <div
      ref={containerRef}
      className={`flex min-h-0 min-w-0 ${stackClass} ${className ?? ""}`}
      data-dragging={dragging ? "true" : undefined}
      data-testid={testId}
    >
      <div className="flex min-h-0 min-w-0 overflow-hidden" style={firstStyle}>
        {first}
      </div>
      <div
        ref={separatorRef}
        id={separatorId}
        role="separator"
        tabIndex={0}
        aria-orientation={direction === "horizontal" ? "vertical" : "horizontal"}
        aria-label={`Resize ${labels[0]} and ${labels[1]}`}
        aria-valuenow={separatorValue(fraction, constraints)}
        aria-valuemin={Math.round(fractionBounds(constraints).min * 100)}
        aria-valuemax={Math.round(fractionBounds(constraints).max * 100)}
        aria-valuetext={`${labels[0]} ${separatorValue(fraction, constraints)}%`}
        title="Drag to resize · double-click to reset · arrow keys when focused"
        data-testid={testId ? `${testId}-divider` : "split-divider"}
        className={direction === "horizontal" ? "split-divider-x" : "split-divider-y"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => commit(defaultFraction)}
        onKeyDown={onKeyDown}
      >
        <span className="split-divider-grip" aria-hidden />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">{second}</div>
    </div>
  );
}
