import { describe, expect, it } from 'vitest'
import {
  clampToReachable,
  cursorFor,
  newCursorStack,
  withNextCursor,
  type CursorStack,
} from './cursorStack'

describe('newCursorStack', () => {
  it('starts with page 1 reachable from the beginning', () => {
    expect(cursorFor(newCursorStack(), 1)).toBeNull()
  })
})

describe('cursorFor', () => {
  const cursors: CursorStack = [null, 'c1', 'c2']

  it('returns the cursor that loads a known page', () => {
    expect(cursorFor(cursors, 2)).toBe('c1')
    expect(cursorFor(cursors, 3)).toBe('c2')
  })

  it('returns undefined for a page never reached', () => {
    expect(cursorFor(cursors, 4)).toBeUndefined()
  })

  it('distinguishes "start from the beginning" from "unreachable"', () => {
    // null is a real cursor meaning page 1; undefined means no such page.
    expect(cursorFor(cursors, 1)).toBeNull()
    expect(cursorFor(cursors, 9)).toBeUndefined()
  })
})

describe('withNextCursor', () => {
  it('makes the next page reachable', () => {
    const cursors = withNextCursor(newCursorStack(), 1, 'c1')

    expect(cursors).toEqual([null, 'c1'])
    expect(cursorFor(cursors, 2)).toBe('c1')
  })

  it('does not grow when the last page has been reached', () => {
    expect(withNextCursor(newCursorStack(), 1, null)).toEqual([null])
  })

  it('ignores a result for a page that is not the furthest known', () => {
    // Re-delivering page 1 while page 3 is known must not truncate or duplicate.
    const cursors: CursorStack = [null, 'c1', 'c2']

    expect(withNextCursor(cursors, 1, 'c1')).toEqual([null, 'c1', 'c2'])
  })

  it('is idempotent when a live query redelivers the same page', () => {
    const once = withNextCursor(newCursorStack(), 1, 'c1')
    const twice = withNextCursor(once, 1, 'c1')

    expect(twice).toEqual([null, 'c1'])
  })
})

describe('clampToReachable', () => {
  const cursors: CursorStack = [null, 'c1', 'c2']

  it('allows a page already reached', () => {
    expect(clampToReachable(cursors, 2)).toBe(2)
  })

  it('refuses to jump past the furthest known page', () => {
    expect(clampToReachable(cursors, 8)).toBe(3)
  })

  it('pulls a page below one up to the first', () => {
    expect(clampToReachable(cursors, 0)).toBe(1)
    expect(clampToReachable(cursors, -5)).toBe(1)
  })

  it('falls back to the first page for a value that is not a number', () => {
    expect(clampToReachable(cursors, Number.NaN)).toBe(1)
  })
})
