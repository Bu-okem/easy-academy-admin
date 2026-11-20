import type { DatabaseReader, DatabaseWriter } from '../_generated/server'
import { asId } from '../../domain/ids'
import { toConvexId } from './ids'
import type { BehaviorRepository } from '../../domain/behavior/ports'

/** Convex-backed implementation of the behavior port. */
export function convexBehaviorRepository(
  db: DatabaseReader & DatabaseWriter
): BehaviorRepository {
  return {
    async findTerm(termId) {
      const term = await db.get(toConvexId<'terms'>(termId))
      return term
        ? { id: asId(term._id), startDate: term.startDate, endDate: term.endDate }
        : null
    },

    async insert(record) {
      const id = await db.insert('behaviorRecords', {
        studentId: toConvexId<'students'>(record.studentId),
        teacherId: toConvexId<'teachers'>(record.teacherId),
        termId: toConvexId<'terms'>(record.termId),
        type: record.type,
        severityLevel: record.severityLevel,
        description: record.description,
        incidentDate: record.incidentDate,
        actionTaken: record.actionTaken,
      })
      return asId(id)
    },
  }
}
