import type { ClassSectionId, StudentId, TermId, TermSummaryId } from '../ids'

/** The report card header. Mirrors the termSummaries table. */
export interface TermSummary {
  id: TermSummaryId
  studentId: StudentId
  termId: TermId
  classSectionId: ClassSectionId
  totalDaysPresent?: number
  totalDaysAbsent?: number
  termGpa?: number
  formTeacherRemark?: string
  principalRemark?: string
  /** While false, the report card is invisible to parents and students. */
  isPublished: boolean
}

export interface ResultsRepository {
  findSummary(id: TermSummaryId): Promise<TermSummary | null>

  /** How many subject line items the report card actually has. */
  countSubjectResults(where: { studentId: StudentId; termId: TermId }): Promise<number>

  setPublished(id: TermSummaryId, isPublished: boolean): Promise<void>
}
