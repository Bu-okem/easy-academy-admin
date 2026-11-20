import { isIsoDate, isWithin } from '../dates'
import { err, ok, type Result } from '../result'
import type { BehaviorRecord, BehaviorRepository } from './ports'

export type RecordBehaviorInput = Omit<BehaviorRecord, 'id'>

export type BehaviorProblem =
  | { kind: 'descriptionRequired' }
  | { kind: 'invalidSeverity' }
  | { kind: 'invalidDate'; date: string }
  | { kind: 'termNotFound' }
  | { kind: 'dateOutsideTerm'; date: string; startDate: string; endDate: string }

/**
 * Records a merit or demerit incident for a student within the active term.
 *
 * Severity is bounded 1–5 (matching the schema comment), descriptions are
 * trimmed and required, and incident dates must fall inside the term.
 */
export async function recordBehavior(
  repo: BehaviorRepository,
  input: RecordBehaviorInput
): Promise<Result<BehaviorRecord, BehaviorProblem>> {
  const description = input.description.trim()
  if (description === '') return err({ kind: 'descriptionRequired' })

  if (!Number.isInteger(input.severityLevel) || input.severityLevel < 1 || input.severityLevel > 5) {
    return err({ kind: 'invalidSeverity' })
  }

  if (!isIsoDate(input.incidentDate)) {
    return err({ kind: 'invalidDate', date: input.incidentDate })
  }

  const term = await repo.findTerm(input.termId)
  if (!term) return err({ kind: 'termNotFound' })

  if (!isWithin(input.incidentDate, term.startDate, term.endDate)) {
    return err({
      kind: 'dateOutsideTerm',
      date: input.incidentDate,
      startDate: term.startDate,
      endDate: term.endDate,
    })
  }

  const trimmedAction = input.actionTaken?.trim()
  const actionTaken = trimmedAction === '' ? undefined : trimmedAction

  const record: Omit<BehaviorRecord, 'id'> = {
    studentId: input.studentId,
    teacherId: input.teacherId,
    termId: input.termId,
    type: input.type,
    severityLevel: input.severityLevel,
    description,
    incidentDate: input.incidentDate,
    actionTaken,
  }

  const id = await repo.insert(record)
  return ok({ id, ...record })
}

/** Plain-language text, in the voice set by docs/DESIGN.md section 6. */
export function describeBehaviorProblem(problem: BehaviorProblem): string {
  switch (problem.kind) {
    case 'descriptionRequired':
      return 'Describe what happened before recording.'
    case 'invalidSeverity':
      return 'Severity must be a whole number from 1 to 5.'
    case 'invalidDate':
      return `"${problem.date}" is not a valid date.`
    case 'termNotFound':
      return 'That term no longer exists.'
    case 'dateOutsideTerm':
      return `${problem.date} falls outside this term, which runs ${problem.startDate} to ${problem.endDate}.`
  }
}
