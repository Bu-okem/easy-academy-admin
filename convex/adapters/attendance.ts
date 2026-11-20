import type { DatabaseReader, DatabaseWriter } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'
import { asId } from '../../domain/ids'
import { toConvexId } from './ids'
import type { AttendanceRecord, AttendanceRepository } from '../../domain/attendance/ports'

/**
 * Convex-backed implementation of the attendance port. The only file that knows
 * attendance records live in Convex.
 */
export function convexAttendanceRepository(
  db: DatabaseReader & DatabaseWriter
): AttendanceRepository {
  const toDomain = (doc: Doc<'attendanceRecords'>): AttendanceRecord => ({
    id: asId(doc._id),
    studentId: asId(doc.studentId),
    classSectionId: asId(doc.classSectionId),
    teacherId: asId(doc.teacherId),
    termId: asId(doc.termId),
    attendanceDate: doc.attendanceDate,
    status: doc.status,
    remarks: doc.remarks,
  })

  return {
    async findTerm(termId) {
      const term = await db.get(toConvexId<'terms'>(termId))
      return term
        ? { id: asId(term._id), startDate: term.startDate, endDate: term.endDate }
        : null
    },

    async findForStudentOnDate({ studentId, classSectionId, attendanceDate }) {
      const doc = await db
        .query('attendanceRecords')
        .withIndex('unique_daily_attendance', (q) =>
          q
            .eq('studentId', toConvexId<'students'>(studentId))
            .eq('classSectionId', toConvexId<'classSections'>(classSectionId))
            .eq('attendanceDate', attendanceDate)
        )
        .first()
      return doc ? toDomain(doc) : null
    },

    async insert(record) {
      const id = await db.insert('attendanceRecords', {
        studentId: toConvexId<'students'>(record.studentId),
        classSectionId: toConvexId<'classSections'>(record.classSectionId),
        teacherId: toConvexId<'teachers'>(record.teacherId),
        termId: toConvexId<'terms'>(record.termId),
        attendanceDate: record.attendanceDate,
        status: record.status,
        remarks: record.remarks,
      })
      return asId(id)
    },

    async amend(id, patch) {
      // Passing undefined removes the field, which is what a cleared remark means.
      await db.patch(toConvexId<'attendanceRecords'>(id), {
        status: patch.status,
        remarks: patch.remarks,
      })
    },
  }
}
