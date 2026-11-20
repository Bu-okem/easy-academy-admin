import { err, ok, type Result } from '../result'
import type { AcademicYearId } from '../ids'
import type { AcademicsRepository, AcademicYear } from './ports'

export type YearProblem =
  | { kind: 'nameRequired' }
  | { kind: 'duplicateYear'; name: string }
  | { kind: 'yearNotFound' }

/**
 * Adds an academic year.
 *
 * The first year a school creates becomes the active one. Nothing in the
 * application works without an active year - the Overview, the timetable and
 * results all resolve their term through it - so leaving a brand new school with
 * no active year would be a trap rather than a neutral default.
 */
export async function addAcademicYear(
  repo: AcademicsRepository,
  name: string
): Promise<Result<AcademicYearId, YearProblem>> {
  const trimmed = name.trim()
  if (trimmed === '') return err({ kind: 'nameRequired' })

  const years = await repo.listYears()
  if (years.some((year) => year.name.toLowerCase() === trimmed.toLowerCase())) {
    return err({ kind: 'duplicateYear', name: trimmed })
  }

  return ok(await repo.insertYear({ name: trimmed, isActive: years.length === 0 }))
}

/**
 * Makes one year the active one, and every other year inactive.
 *
 * Exclusivity is enforced here because the schema cannot express it: `isActive`
 * is a plain boolean on each row, so two active years are perfectly storable and
 * would make "the current term" ambiguous everywhere it is read.
 */
export async function activateAcademicYear(
  repo: AcademicsRepository,
  yearId: AcademicYearId
): Promise<Result<AcademicYear, YearProblem>> {
  const years = await repo.listYears()
  const target = years.find((year) => year.id === yearId)
  if (!target) return err({ kind: 'yearNotFound' })

  for (const year of years) {
    const shouldBeActive = year.id === yearId
    if (year.isActive !== shouldBeActive) await repo.setYearActive(year.id, shouldBeActive)
  }

  return ok({ ...target, isActive: true })
}

/** Plain-language text, in the voice set by docs/DESIGN.md section 6. */
export function describeYearProblem(problem: YearProblem): string {
  switch (problem.kind) {
    case 'nameRequired':
      return 'An academic year needs a name.'
    case 'duplicateYear':
      return `${problem.name} already exists.`
    case 'yearNotFound':
      return 'That academic year no longer exists.'
  }
}
