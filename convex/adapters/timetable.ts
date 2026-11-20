import type { DatabaseReader, DatabaseWriter } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'
import { asId } from '../../domain/ids'
import type { TimetableSlotId } from '../../domain/ids'
import { toConvexId } from './ids'
import type { TimetableRepository, TimetableSlot } from '../../domain/timetable/ports'

/**
 * Convex-backed implementation of the timetable port. This file is the only
 * place that knows timetable slots live in Convex; swapping databases means
 * writing a sibling of this file and nothing in domain/.
 *
 * Convex mutations are transactional, so passing one `ctx.db` satisfies the
 * port's single-transaction requirement.
 */
export function convexTimetableRepository(db: DatabaseReader & DatabaseWriter): TimetableRepository {
  const toDomain = (doc: Doc<'timetableSlots'>): TimetableSlot => ({
    id: asId(doc._id),
    termId: asId(doc.termId),
    teachingAssignmentId: asId(doc.teachingAssignmentId),
    teacherId: asId(doc.teacherId),
    classSectionId: asId(doc.classSectionId),
    subjectId: asId(doc.subjectId),
    classroomId: asId(doc.classroomId),
    dayOfWeek: doc.dayOfWeek,
    periodId: asId(doc.periodId),
  })

  return {
    async findByTeacher({ termId, teacherId, dayOfWeek, periodId }) {
      const doc = await db
        .query('timetableSlots')
        .withIndex('prevent_teacher_collision', (q) =>
          q
            .eq('termId', toConvexId<'terms'>(termId))
            .eq('teacherId', toConvexId<'teachers'>(teacherId))
            .eq('dayOfWeek', dayOfWeek)
            .eq('periodId', toConvexId<'periods'>(periodId))
        )
        .first()
      return doc ? toDomain(doc) : null
    },

    async findByClassroom({ termId, classroomId, dayOfWeek, periodId }) {
      const doc = await db
        .query('timetableSlots')
        .withIndex('prevent_room_collision', (q) =>
          q
            .eq('termId', toConvexId<'terms'>(termId))
            .eq('classroomId', toConvexId<'classrooms'>(classroomId))
            .eq('dayOfWeek', dayOfWeek)
            .eq('periodId', toConvexId<'periods'>(periodId))
        )
        .first()
      return doc ? toDomain(doc) : null
    },

    async findByClassSection({ termId, classSectionId, dayOfWeek, periodId }) {
      const doc = await db
        .query('timetableSlots')
        .withIndex('prevent_class_collision', (q) =>
          q
            .eq('termId', toConvexId<'terms'>(termId))
            .eq('classSectionId', toConvexId<'classSections'>(classSectionId))
            .eq('dayOfWeek', dayOfWeek)
            .eq('periodId', toConvexId<'periods'>(periodId))
        )
        .first()
      return doc ? toDomain(doc) : null
    },

    async insert(slot): Promise<TimetableSlotId> {
      const id = await db.insert('timetableSlots', {
        termId: toConvexId<'terms'>(slot.termId),
        teachingAssignmentId: toConvexId<'teachingAssignments'>(slot.teachingAssignmentId),
        teacherId: toConvexId<'teachers'>(slot.teacherId),
        classSectionId: toConvexId<'classSections'>(slot.classSectionId),
        subjectId: toConvexId<'subjects'>(slot.subjectId),
        classroomId: toConvexId<'classrooms'>(slot.classroomId),
        dayOfWeek: slot.dayOfWeek,
        periodId: toConvexId<'periods'>(slot.periodId),
      })
      return asId(id)
    },
  }
}
