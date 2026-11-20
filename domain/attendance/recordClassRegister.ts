import { isIsoDate, isWithin } from '../dates'
import { err, ok, type Result } from '../result'
import type { StudentId } from '../ids'
import type { AttendanceRepository, AttendanceStatus } from './ports'
import { upsertEntry, type AttendanceProblem } from './recordAttendance'
import type { ClassSectionId, TeacherId, TermId } from '../ids'

export interface RegisterEntry {
  studentId: StudentId
  status: AttendanceStatus
  remarks?: string
}

export interface ClassRegister {
  classSectionId: ClassSectionId
  teacherId: TeacherId
  termId: TermId
  attendanceDate: string
  entries: readonly RegisterEntry[]
}

export type RegisterProblem =
  | AttendanceProblem
  | { kind: 'emptyRegister' }
  | { kind: 'duplicateStudent'; count: number }

export interface RegisterRecorded {
  /** Entries written for the first time. */
  recorded: number
  /** Entries that replaced one already taken. */
  corrected: number
}

/**
 * Takes a whole class register in one go.
 *
 * **All or nothing.** The date and the term are checked once, before anything is
 * written, because those are properties of the submission rather than of any one
 * student - so there is no case where half a register lands. A half-written
 * register is worse than none: it looks taken, and the missing students are
 * indistinguishable from students nobody marked.
 *
 * The caller is responsible for running this inside a transaction; the repository
 * port already requires one.
 */
export async function recordClassRegister(
  repo: AttendanceRepository,
  register: ClassRegister
): Promise<Result<RegisterRecorded, RegisterProblem>> {
  if (register.entries.length === 0) return err({ kind: 'emptyRegister' })

  // One student, one status per day. Two rows for the same student in a single
  // submission would silently let the last one win.
  const distinct = new Set(register.entries.map((entry) => entry.studentId))
  if (distinct.size !== register.entries.length) {
    return err({
      kind: 'duplicateStudent',
      count: register.entries.length - distinct.size,
    })
  }

  if (!isIsoDate(register.attendanceDate)) {
    return err({ kind: 'invalidDate', date: register.attendanceDate })
  }

  const term = await repo.findTerm(register.termId)
  if (!term) return err({ kind: 'termNotFound' })

  if (!isWithin(register.attendanceDate, term.startDate, term.endDate)) {
    return err({
      kind: 'dateOutsideTerm',
      date: register.attendanceDate,
      termStart: term.startDate,
      termEnd: term.endDate,
    })
  }

  let recorded = 0
  let corrected = 0

  for (const entry of register.entries) {
    const result = await upsertEntry(repo, {
      studentId: entry.studentId,
      classSectionId: register.classSectionId,
      teacherId: register.teacherId,
      termId: register.termId,
      attendanceDate: register.attendanceDate,
      status: entry.status,
      remarks: entry.remarks,
    })
    if (result.outcome === 'recorded') recorded++
    else corrected++
  }

  return ok({ recorded, corrected })
}

/** Plain-language text, in the voice set by docs/DESIGN.md section 6. */
export function describeRegisterProblem(problem: RegisterProblem): string {
  switch (problem.kind) {
    case 'emptyRegister':
      return 'There is nobody in this class to record.'
    case 'duplicateStudent':
      return 'The same student appears more than once in this register.'
    case 'invalidDate':
      return `"${problem.date}" is not a valid date.`
    case 'termNotFound':
      return 'That term no longer exists.'
    case 'dateOutsideTerm':
      return `${problem.date} falls outside this term, which runs ${problem.termStart} to ${problem.termEnd}.`
  }
}
