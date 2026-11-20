import type {
  ClassSectionId,
  ClassroomId,
  PeriodId,
  SubjectId,
  TeacherId,
  TeachingAssignmentId,
  TermId,
  TimetableSlotId,
} from '../ids'

export type DayOfWeek =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'

export interface TimetableSlot {
  id: TimetableSlotId
  termId: TermId
  teachingAssignmentId: TeachingAssignmentId
  teacherId: TeacherId
  classSectionId: ClassSectionId
  subjectId: SubjectId
  classroomId: ClassroomId
  dayOfWeek: DayOfWeek
  periodId: PeriodId
}

/** Identifies one cell of the timetable grid: a term, a weekday, a period. */
export interface SlotCoordinate {
  termId: TermId
  dayOfWeek: DayOfWeek
  periodId: PeriodId
}

/**
 * The port the timetable domain declares for itself. A Convex adapter backs it
 * today; any store that can answer these four questions can back it tomorrow.
 *
 * Implementations must run all four calls inside a single transaction, or the
 * collision checks can pass and then be invalidated before the insert lands.
 */
export interface TimetableRepository {
  /** The slot occupying this teacher's time in this cell, if any. */
  findByTeacher(where: SlotCoordinate & { teacherId: TeacherId }): Promise<TimetableSlot | null>

  /** The slot occupying this room in this cell, if any. */
  findByClassroom(where: SlotCoordinate & { classroomId: ClassroomId }): Promise<TimetableSlot | null>

  /** The slot this class section is already sitting in for this cell, if any. */
  findByClassSection(
    where: SlotCoordinate & { classSectionId: ClassSectionId }
  ): Promise<TimetableSlot | null>

  insert(slot: Omit<TimetableSlot, 'id'>): Promise<TimetableSlotId>
}
