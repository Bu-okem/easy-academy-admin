import type { DatabaseReader, DatabaseWriter } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'
import { asId } from '../../domain/ids'
import { toConvexId } from './ids'
import type { ResultsRepository, TermSummary } from '../../domain/results/ports'

/** Convex-backed implementation of the results port. */
export function convexResultsRepository(
  db: DatabaseReader & DatabaseWriter
): ResultsRepository {
  const toDomain = (doc: Doc<'termSummaries'>): TermSummary => ({
    id: asId(doc._id),
    studentId: asId(doc.studentId),
    termId: asId(doc.termId),
    classSectionId: asId(doc.classSectionId),
    totalDaysPresent: doc.totalDaysPresent,
    totalDaysAbsent: doc.totalDaysAbsent,
    termGpa: doc.termGpa,
    formTeacherRemark: doc.formTeacherRemark,
    principalRemark: doc.principalRemark,
    isPublished: doc.isPublished,
  })

  return {
    async findSummary(id) {
      const doc = await db.get(toConvexId<'termSummaries'>(id))
      return doc ? toDomain(doc) : null
    },

    async countSubjectResults({ studentId, termId }) {
      // unique_student_term_subject is [studentId, termId, subjectId]; querying
      // the first two fields walks exactly this student's line items for the term.
      const rows = await db
        .query('termSubjectResults')
        .withIndex('unique_student_term_subject', (q) =>
          q.eq('studentId', toConvexId<'students'>(studentId)).eq('termId', toConvexId<'terms'>(termId))
        )
        .collect()
      return rows.length
    },

    async setPublished(id, isPublished) {
      await db.patch(toConvexId<'termSummaries'>(id), { isPublished })
    },
  }
}
