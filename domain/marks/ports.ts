import type { AssessmentId, StudentId, StudentMarkId, TeachingAssignmentId, TermId } from '../ids'

/** Mirrors the schema's vocabulary exactly (docs/DESIGN.md section 6). */
export type MarkStatus = 'present' | 'absent' | 'excused' | 'incomplete'

/** Only what the marking rules need from an assessment. */
export interface AssessmentBlueprint {
  id: AssessmentId
  name: string
  maxScore: number
  weight?: number
  assignmentId?: TeachingAssignmentId
}

export interface StudentMark {
  id: StudentMarkId
  assessmentId: AssessmentId
  studentId: StudentId
  /** Absent from the record entirely when the student did not sit the test. */
  score?: number
  status: MarkStatus
}

export interface MarksRepository {
  findAssessment(assessmentId: AssessmentId): Promise<AssessmentBlueprint | null>

  findAssignment(
    assignmentId: TeachingAssignmentId
  ): Promise<{ id: TeachingAssignmentId; termId: TermId } | null>

  listAssessmentsForAssignment(
    assignmentId: TeachingAssignmentId
  ): Promise<Array<{ id: AssessmentId; name: string; weight: number; maxScore: number }>>

  insertAssessment(input: {
    assignmentId: TeachingAssignmentId
    termId: TermId
    name: string
    weight: number
    maxScore: number
  }): Promise<AssessmentId>

  findMark(where: {
    studentId: StudentId
    assessmentId: AssessmentId
  }): Promise<StudentMark | null>

  insert(mark: Omit<StudentMark, 'id'>): Promise<StudentMarkId>

  amend(id: StudentMarkId, patch: { score?: number; status: MarkStatus }): Promise<void>
}
