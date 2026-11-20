import { describe, expect, it } from 'vitest'
import { clampPage, pageRange } from './pagination'

describe('pageRange', () => {
  it('describes a full first page', () => {
    expect(pageRange(1, 8, 14)).toMatchObject({
      first: 1,
      last: 8,
      lastPage: 2,
      hasPrevious: false,
      hasNext: true,
    })
  })

  it('describes a partial last page', () => {
    expect(pageRange(2, 8, 14)).toMatchObject({
      first: 9,
      last: 14,
      hasPrevious: true,
      hasNext: false,
    })
  })

  it('counts from zero when there is nothing to show', () => {
    expect(pageRange(1, 8, 0)).toMatchObject({
      first: 0,
      last: 0,
      lastPage: 1,
      hasPrevious: false,
      hasNext: false,
    })
  })

  it('handles a total that fills exactly one page', () => {
    expect(pageRange(1, 8, 8)).toMatchObject({ first: 1, last: 8, lastPage: 1, hasNext: false })
  })

  it('handles a single row', () => {
    expect(pageRange(1, 8, 1)).toMatchObject({ first: 1, last: 1, lastPage: 1 })
  })

  it('does not report rows beyond the total when the page is too high', () => {
    const range = pageRange(99, 8, 14)

    expect(range.last).toBe(14)
    expect(range.hasNext).toBe(false)
  })

  it('treats a page below one as the first page', () => {
    expect(pageRange(0, 8, 14)).toMatchObject({ first: 1, last: 8 })
  })

  it('computes the last page for an exact multiple', () => {
    expect(pageRange(1, 10, 100).lastPage).toBe(10)
  })

  it('computes the last page for a remainder', () => {
    expect(pageRange(1, 10, 101).lastPage).toBe(11)
  })
})

describe('clampPage', () => {
  it('keeps a page inside the range', () => {
    expect(clampPage(3, 5)).toBe(3)
  })

  it('pulls a page below one up to one', () => {
    expect(clampPage(-2, 5)).toBe(1)
  })

  it('pulls a page past the end back to the last page', () => {
    expect(clampPage(99, 5)).toBe(5)
  })

  it('falls back to the first page for a value that is not a number', () => {
    expect(clampPage(Number.NaN, 5)).toBe(1)
  })

  it('truncates a fractional page', () => {
    expect(clampPage(2.7, 5)).toBe(2)
  })
})
