import { err, ok, type Result } from '../result'
import type { AssessmentId, TeachingAssignmentId } from '../ids'
import type { MarksRepository } from './ports'

export interface AddAssessmentInput {
  assignmentId: TeachingAssignmentId
  name: string
  /** Fraction between 0 (exclusive) and 1 (inclusive), e.g. 0.4 for 40%. */
  weight: number
  maxScore: number
}

export type AssessmentProblem =
  | { kind: 'assignmentNotFound' }
  | { kind: 'nameRequired' }
  | { kind: 'invalidWeight' }
  | { kind: 'invalidMaxScore' }
  | { kind: 'weightExceedsTotal'; currentWeight: number; requestedWeight: number }

export interface AddedAssessment {
  id: AssessmentId
  name: string
  weight: number
  maxScore: number
}

/**
 * Adds an assessment blueprint to a teaching assignment while ensuring total
 * weight across assessments for that assignment never exceeds 100% (1.0).
 */
export async function addAssessment(
  repo: MarksRepository,
  input: AddAssessmentInput
): Promise<Result<AddedAssessment, AssessmentProblem>> {
  const assignment = await repo.findAssignment(input.assignmentId)
  if (!assignment) return err({ kind: 'assignmentNotFound' })

  const name = input.name.trim()
  if (name === '') return err({ kind: 'nameRequired' })

  if (!Number.isFinite(input.weight) || input.weight <= 0 || input.weight > 1) {
    return err({ kind: 'invalidWeight' })
  }

  if (!Number.isFinite(input.maxScore) || input.maxScore <= 0) {
    return err({ kind: 'invalidMaxScore' })
  }

  const existing = await repo.listAssessmentsForAssignment(input.assignmentId)
  const currentWeight = existing.reduce((sum, item) => sum + item.weight, 0)
  if (currentWeight + input.weight > 1 + 1e-9) {
    return err({
      kind: 'weightExceedsTotal',
      currentWeight: Math.round(currentWeight * 1000) / 1000,
      requestedWeight: input.weight,
    })
  }

  const id = await repo.insertAssessment({
    assignmentId: assignment.id,
    termId: assignment.termId,
    name,
    weight: input.weight,
    maxScore: input.maxScore,
  })

  return ok({ id, name, weight: input.weight, maxScore: input.maxScore })
}

/** Plain-language text, in the voice set by docs/DESIGN.md section 6. */
export function describeAssessmentProblem(problem: AssessmentProblem): string {
  switch (problem.kind) {
    case 'assignmentNotFound':
      return 'That teaching assignment no longer exists.'
    case 'nameRequired':
      return 'An assessment needs a name.'
    case 'invalidWeight':
      return 'Weight must be greater than 0% and at most 100%.'
    case 'invalidMaxScore':
      return 'Maximum score must be greater than zero.'
    case 'weightExceedsTotal': {
      const remaining = Math.max(0, Math.round((1 - problem.currentWeight) * 100))
      return `Total weight cannot exceed 100%. Only ${remaining}% remains for this assignment.`
    }
  }
}
