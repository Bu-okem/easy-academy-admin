/**
 * Pagination arithmetic for DESIGN.md 5.16, kept out of the component so the
 * edge cases - an empty table, a partial last page, a page number out of range -
 * can be tested without rendering anything.
 */
export interface PageRange {
  /** 1-based index of the first row shown; 0 when there are no rows. */
  first: number
  /** 1-based index of the last row shown; 0 when there are no rows. */
  last: number
  lastPage: number
  hasPrevious: boolean
  hasNext: boolean
}

export function pageRange(page: number, pageSize: number, total: number): PageRange {
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const current = clampPage(page, lastPage)

  return {
    first: total === 0 ? 0 : (current - 1) * pageSize + 1,
    last: Math.min(current * pageSize, total),
    lastPage,
    hasPrevious: current > 1,
    hasNext: current < lastPage,
  }
}

export function clampPage(page: number, lastPage: number): number {
  if (!Number.isFinite(page)) return 1
  return Math.min(Math.max(Math.trunc(page), 1), lastPage)
}
