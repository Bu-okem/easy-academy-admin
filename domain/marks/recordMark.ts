import { err, ok, type Result } from '../result'
import type { MarksRepository, StudentMark } from './ports'

export type RecordMarkInput = Omit<StudentMark, 'id'>

export type MarkProblem =
  | { kind: 'assessmentNotFound' }
  | { kind: 'scoreRequired' }
  | { kind: 'scoreNotAllowed'; status: StudentMark['status'] }
  | { kind: 'scoreOutOfRange'; score: number; maxScore: number }

export interface MarkRecorded {
  /** 'recorded' on a first entry, 'corrected' when a mark was revised. */
  outcome: 'recorded' | 'corrected'
  mark: StudentMark
}

/**
 * Records or corrects one student's mark for one assessment.
 *
 * Three rules live here. A student can hold only one mark per assessment, so a
 * second submission amends the first. A student marked present must have a
 * score, and it must fall inside the assessment's own maximum. A student who
 * did not sit the test must not carry a score at all - otherwise a zero that
 * means "absent" is indistinguishable from a zero that was earned, and every
 * average computed downstream is wrong.
 */
export async function recordMark(
  repo: MarksRepository,
  input: RecordMarkInput
): Promise<Result<MarkRecorded, MarkProblem>> {
  const assessment = await repo.findAssessment(input.assessmentId)
  if (!assessment) return err({ kind: 'assessmentNotFound' })

  if (input.status === 'present') {
    if (input.score === undefined) return err({ kind: 'scoreRequired' })
    if (!Number.isFinite(input.score) || input.score < 0 || input.score > assessment.maxScore) {
      return err({
        kind: 'scoreOutOfRange',
        score: input.score,
        maxScore: assessment.maxScore,
      })
    }
  } else if (input.score !== undefined) {
    return err({ kind: 'scoreNotAllowed', status: input.status })
  }

  const existing = await repo.findMark({
    studentId: input.studentId,
    assessmentId: input.assessmentId,
  })

  if (existing) {
    await repo.amend(existing.id, { score: input.score, status: input.status })
    return ok({
      outcome: 'corrected',
      mark: { ...existing, score: input.score, status: input.status },
    })
  }

  const id = await repo.insert(input)
  return ok({ outcome: 'recorded', mark: { id, ...input } })
}

/** Plain-language text, in the voice set by docs/DESIGN.md section 6. */
export function describeMarkProblem(problem: MarkProblem): string {
  switch (problem.kind) {
    case 'assessmentNotFound':
      return 'That assessment no longer exists.'
    case 'scoreRequired':
      return 'A student marked present needs a score.'
    case 'scoreNotAllowed':
      return `A student marked ${problem.status} cannot have a score.`
    case 'scoreOutOfRange':
      return `${problem.score} is outside this assessment, which is marked out of ${problem.maxScore}.`
  }
}
