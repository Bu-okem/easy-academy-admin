import { asId } from '../ids'
import type { TimetableSlot } from '../timetable/ports'

/**
 * One valid placement: Mr A teaches Maths to 10A in Room 1, Monday period 1.
 * Tests override single fields to express exactly what they are varying.
 */
export const aSlot = (
  overrides: Partial<Omit<TimetableSlot, 'id'>> = {}
): Omit<TimetableSlot, 'id'> => ({
  termId: asId<'terms'>('term1'),
  teachingAssignmentId: asId<'teachingAssignments'>('assignment1'),
  teacherId: asId<'teachers'>('teacher1'),
  classSectionId: asId<'classSections'>('section10A'),
  subjectId: asId<'subjects'>('maths'),
  classroomId: asId<'classrooms'>('room1'),
  dayOfWeek: 'Monday',
  periodId: asId<'periods'>('period1'),
  ...overrides,
})
