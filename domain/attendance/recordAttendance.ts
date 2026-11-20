import { isIsoDate, isWithin } from '../dates'
import { err, ok, type Result } from '../result'
import type { AttendanceRecord, AttendanceRepository } from './ports'

export type RecordAttendanceInput = Omit<AttendanceRecord, 'id'>

export type AttendanceProblem =
  | { kind: 'invalidDate'; date: string }
  | { kind: 'termNotFound' }
  | { kind: 'dateOutsideTerm'; date: string; termStart: string; termEnd: string }

export interface AttendanceRecorded {
  /** 'recorded' on a first entry, 'corrected' when a register was revised. */
  outcome: 'recorded' | 'corrected'
  record: AttendanceRecord
}

/**
 * Takes or corrects one student's register entry for one day.
 *
 * The schema allows a student only one attendance status per day. Re-submitting
 * therefore amends the existing entry rather than adding a second one - the
 * register genuinely does get corrected after the fact, and an upsert is how
 * that rule stays true. The `unique_daily_attendance` index makes the lookup
 * cheap; it does not enforce the rule, which is why the rule lives here.
 */
export async function recordAttendance(
  repo: AttendanceRepository,
  input: RecordAttendanceInput
): Promise<Result<AttendanceRecorded, AttendanceProblem>> {
  if (!isIsoDate(input.attendanceDate)) {
    return err({ kind: 'invalidDate', date: input.attendanceDate })
  }

  const term = await repo.findTerm(input.termId)
  if (!term) return err({ kind: 'termNotFound' })

  if (!isWithin(input.attendanceDate, term.startDate, term.endDate)) {
    return err({
      kind: 'dateOutsideTerm',
      date: input.attendanceDate,
      termStart: term.startDate,
      termEnd: term.endDate,
    })
  }

  return ok(await upsertEntry(repo, input))
}

/**
 * Writes one entry, correcting an existing one rather than adding a second.
 *
 * Shared with the class register, which validates the date and term once for the
 * whole submission rather than re-checking them per student.
 */
export async function upsertEntry(
  repo: AttendanceRepository,
  input: RecordAttendanceInput
): Promise<AttendanceRecorded> {
  const existing = await repo.findForStudentOnDate({
    studentId: input.studentId,
    classSectionId: input.classSectionId,
    attendanceDate: input.attendanceDate,
  })

  if (existing) {
    await repo.amend(existing.id, { status: input.status, remarks: input.remarks })
    return {
      outcome: 'corrected',
      record: { ...existing, status: input.status, remarks: input.remarks },
    }
  }

  const id = await repo.insert(input)
  return { outcome: 'recorded', record: { id, ...input } }
}

/** Plain-language text, in the voice set by docs/DESIGN.md section 6. */
export function describeAttendanceProblem(problem: AttendanceProblem): string {
  switch (problem.kind) {
    case 'invalidDate':
      return `"${problem.date}" is not a valid date.`
    case 'termNotFound':
      return 'That term no longer exists.'
    case 'dateOutsideTerm':
      return `${problem.date} falls outside this term, which runs ${problem.termStart} to ${problem.termEnd}.`
  }
}
