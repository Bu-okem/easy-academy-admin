import { isIsoDate } from '../dates'
import { err, ok, type Result } from '../result'
import type { AcademicYearId, TermId } from '../ids'
import type { AcademicsRepository, Term } from './ports'

export interface NewTerm {
  academicYearId: AcademicYearId
  name: string
  startDate: string
  endDate: string
}

export type TermProblem =
  | { kind: 'nameRequired' }
  | { kind: 'invalidDate'; date: string }
  | { kind: 'endBeforeStart' }
  | { kind: 'overlaps'; withTerm: string }

/**
 * Adds a term to an academic year.
 *
 * **Terms within a year must not overlap.** Everything that asks "which term is
 * it?" answers by finding the term whose dates contain today, so two overlapping
 * terms would make that question have two answers - and the code that resolves
 * it would silently pick whichever came back first.
 */
export async function addTerm(
  repo: AcademicsRepository,
  term: NewTerm
): Promise<Result<TermId, TermProblem>> {
  const name = term.name.trim()
  if (name === '') return err({ kind: 'nameRequired' })

  for (const date of [term.startDate, term.endDate]) {
    if (!isIsoDate(date)) return err({ kind: 'invalidDate', date })
  }

  // A single-day term is legal; an end before its start is not.
  if (term.endDate < term.startDate) return err({ kind: 'endBeforeStart' })

  const siblings = await repo.listTerms(term.academicYearId)
  const clash = siblings.find((existing) => overlaps(existing, term))
  if (clash) return err({ kind: 'overlaps', withTerm: clash.name })

  return ok(await repo.insertTerm({ ...term, name }))
}

/** Inclusive on both ends: a term ending the day another starts is an overlap. */
function overlaps(a: Pick<Term, 'startDate' | 'endDate'>, b: NewTerm): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate
}

/** Plain-language text, in the voice set by docs/DESIGN.md section 6. */
export function describeTermProblem(problem: TermProblem): string {
  switch (problem.kind) {
    case 'nameRequired':
      return 'A term needs a name.'
    case 'invalidDate':
      return `"${problem.date}" is not a valid date.`
    case 'endBeforeStart':
      return 'A term cannot end before it starts.'
    case 'overlaps':
      return `Those dates overlap ${problem.withTerm}.`
  }
}
