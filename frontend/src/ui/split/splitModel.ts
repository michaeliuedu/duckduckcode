/**
 * The arithmetic behind a draggable split, with no DOM in sight.
 *
 * A split is described by one number: the fraction of the available content
 * space given to the first pane. Fractions (rather than pixels) mean the layout
 * keeps its proportions when the window is resized, while the minimum sizes stay
 * expressed in pixels because that is what a readable pane actually needs.
 */

export interface SplitConstraints {
  /** Total space along the axis, including the divider. */
  total: number;
  /** Smallest useful size of the first pane, in pixels. */
  minFirst: number;
  /** Smallest useful size of the second pane, in pixels. */
  minSecond: number;
  /** Thickness of the divider, in pixels. */
  dividerSize: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Space left for the two panes once the divider has taken its share. */
export function contentSize(constraints: SplitConstraints): number {
  return Math.max(0, constraints.total - constraints.dividerSize);
}

/** True when both panes can be shown at their minimum size. */
export function hasRoomForBoth(constraints: SplitConstraints): boolean {
  return contentSize(constraints) >= constraints.minFirst + constraints.minSecond;
}

/** The fraction range the divider may be dragged through. */
export function fractionBounds(constraints: SplitConstraints): { min: number; max: number } {
  const content = contentSize(constraints);
  if (content <= 0) return { min: 0, max: 1 };
  return {
    min: Math.min(1, constraints.minFirst / content),
    max: Math.max(0, 1 - constraints.minSecond / content),
  };
}

/**
 * Brings a fraction inside the bounds. When the container is too small for both
 * minimums the panes share it in proportion to those minimums, which degrades
 * more gracefully than pinning one pane open and squeezing the other to nothing.
 */
export function clampFraction(fraction: number, constraints: SplitConstraints): number {
  if (!Number.isFinite(fraction)) return 0.5;
  const content = contentSize(constraints);
  if (content <= 0) return clamp01(fraction);
  const { min, max } = fractionBounds(constraints);
  if (min > max) return clamp01(constraints.minFirst / (constraints.minFirst + constraints.minSecond));
  return Math.min(max, Math.max(min, clamp01(fraction)));
}

/** The first pane's size in pixels, rounded to whole device-independent pixels. */
export function firstPaneSize(fraction: number, constraints: SplitConstraints): number {
  return Math.round(clampFraction(fraction, constraints) * contentSize(constraints));
}

/** Converts a pointer position (pixels from the container's start) to a fraction. */
export function fractionFromPosition(position: number, constraints: SplitConstraints): number {
  const content = contentSize(constraints);
  if (content <= 0) return 0.5;
  // The pointer grabs the middle of the divider, so the first pane ends half a
  // divider earlier than the cursor sits.
  return clampFraction((position - constraints.dividerSize / 2) / content, constraints);
}

/** Moves the divider by a number of pixels, for keyboard resizing. */
export function nudgeFraction(fraction: number, deltaPixels: number, constraints: SplitConstraints): number {
  const content = contentSize(constraints);
  if (content <= 0) return fraction;
  return clampFraction(fraction + deltaPixels / content, constraints);
}

/** The value a `role="separator"` should report, as a whole percentage. */
export function separatorValue(fraction: number, constraints: SplitConstraints): number {
  return Math.round(clampFraction(fraction, constraints) * 100);
}

/** Accepts a persisted fraction, rejecting anything that is not a usable number. */
export function acceptFraction(raw: unknown): number | null {
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value) || value <= 0 || value >= 1) return null;
  return value;
}
