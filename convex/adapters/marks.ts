import type { DatabaseReader, DatabaseWriter } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'
import { asId } from '../../domain/ids'
import { toConvexId } from './ids'
import type { MarksRepository, StudentMark } from '../../domain/marks/ports'

/** Convex-backed implementation of the marks port. */
export function convexMarksRepository(db: DatabaseReader & DatabaseWriter): MarksRepository {
  const toDomain = (doc: Doc<'studentMarks'>): StudentMark => ({
    id: asId(doc._id),
    assessmentId: asId(doc.assessmentId),
    studentId: asId(doc.studentId),
    score: doc.score,
    status: doc.status,
  })

  return {
    async findAssessment(assessmentId) {
      const assessment = await db.get(toConvexId<'assessments'>(assessmentId))
      return assessment
        ? {
            id: asId(assessment._id),
            name: assessment.name,
            maxScore: assessment.maxScore,
            weight: assessment.weight,
            assignmentId: asId(assessment.assignmentId),
          }
        : null
    },

    async findAssignment(assignmentId) {
      const assignment = await db.get(toConvexId<'teachingAssignments'>(assignmentId))
      return assignment ? { id: asId(assignment._id), termId: asId(assignment.termId) } : null
    },

    async listAssessmentsForAssignment(assignmentId) {
      const rows = await db
        .query('assessments')
        .withIndex('by_assignment', (q) =>
          q.eq('assignmentId', toConvexId<'teachingAssignments'>(assignmentId))
        )
        .collect()
      return rows.map((row) => ({
        id: asId(row._id),
        name: row.name,
        weight: row.weight,
        maxScore: row.maxScore,
      }))
    },

    async insertAssessment(input) {
      const id = await db.insert('assessments', {
        assignmentId: toConvexId<'teachingAssignments'>(input.assignmentId),
        termId: toConvexId<'terms'>(input.termId),
        name: input.name,
        weight: input.weight,
        maxScore: input.maxScore,
      })
      return asId(id)
    },

    async findMark({ studentId, assessmentId }) {
      const doc = await db
        .query('studentMarks')
        .withIndex('unique_student_assessment', (q) =>
          q
            .eq('studentId', toConvexId<'students'>(studentId))
            .eq('assessmentId', toConvexId<'assessments'>(assessmentId))
        )
        .first()
      return doc ? toDomain(doc) : null
    },

    async insert(mark) {
      const id = await db.insert('studentMarks', {
        assessmentId: toConvexId<'assessments'>(mark.assessmentId),
        studentId: toConvexId<'students'>(mark.studentId),
        score: mark.score,
        status: mark.status,
      })
      return asId(id)
    },

    async amend(id, patch) {
      // Passing undefined removes the score, which is what "did not sit" means.
      await db.patch(toConvexId<'studentMarks'>(id), { score: patch.score, status: patch.status })
    },
  }
}
