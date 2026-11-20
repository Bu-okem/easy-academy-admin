import type { Doc } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

export interface ActiveCalendar {
  activeYear: Doc<'academicYears'>
  terms: Doc<'terms'>[]
  currentTerm: Doc<'terms'> | null
}

/**
 * Resolves the active academic year, its terms ordered by start date, and the
 * term covering `today` (falling back to the earliest term in the year).
 */
export async function activeYearAndTerm(
  ctx: QueryCtx | MutationCtx,
  today = new Date().toISOString().slice(0, 10)
): Promise<ActiveCalendar | null> {
  const activeYear = await ctx.db
    .query('academicYears')
    .filter((q) => q.eq(q.field('isActive'), true))
    .first()
  if (!activeYear) return null

  const terms = (
    await ctx.db
      .query('terms')
      .withIndex('by_academic_year', (q) => q.eq('academicYearId', activeYear._id))
      .collect()
  ).sort((a, b) => a.startDate.localeCompare(b.startDate))

  const currentTerm =
    terms.find((term) => term.startDate <= today && today <= term.endDate) ?? terms[0] ?? null

  return { activeYear, terms, currentTerm }
}

/** The active term for operations, timetable and results queries. */
export async function activeTerm(
  ctx: QueryCtx | MutationCtx,
  today?: string
): Promise<Doc<'terms'> | null> {
  const calendar = await activeYearAndTerm(ctx, today)
  return calendar?.currentTerm ?? null
}
