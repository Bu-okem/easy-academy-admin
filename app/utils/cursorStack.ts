/**
 * Cursor bookkeeping for paging a Convex query behind a page-numbered UI.
 *
 * Convex hands back a cursor for the *next* page and nothing else, so a page
 * number only means something if the cursor that reaches it is already known.
 * `cursors[i]` is the cursor that loads page `i + 1`; page 1 is always `null`,
 * meaning "start from the beginning".
 *
 * The consequence, which the UI must respect: navigation is sequential. You can
 * step to a page you have already reached, or one step past the furthest, and
 * nowhere else. That is exactly what the previous/next controls in DESIGN.md
 * 5.16 offer, so nothing is lost.
 */
export type CursorStack = readonly (string | null)[]

export const newCursorStack = (): CursorStack => [null]

/** The cursor that loads `page`, or undefined when that page is not reachable. */
export function cursorFor(cursors: CursorStack, page: number): string | null | undefined {
  return cursors[page - 1]
}

/**
 * Records the cursor leading out of `page`, so the page after it becomes
 * reachable. Idempotent: re-recording a known cursor changes nothing, which
 * matters because a live query re-delivers its result whenever the data moves.
 */
export function withNextCursor(
  cursors: CursorStack,
  page: number,
  continueCursor: string | null,
): CursorStack {
  const isFurthestKnown = cursors.length === page
  if (!isFurthestKnown || continueCursor === null) return cursors
  return [...cursors, continueCursor]
}

/** The nearest page to `requested` that can actually be reached. */
export function clampToReachable(cursors: CursorStack, requested: number): number {
  if (!Number.isFinite(requested)) return 1
  return Math.min(Math.max(Math.trunc(requested), 1), cursors.length)
}
