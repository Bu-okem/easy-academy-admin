import { err, ok, type Result } from '../result'
import type { TimetableSlot, TimetableRepository } from './ports'

export type PlaceSlotInput = Omit<TimetableSlot, 'id'>

/**
 * Which resource is already booked in this cell. The UI needs to name it, so
 * the conflicting slot travels with the error rather than just a message.
 */
export type SlotConflict = {
  kind: 'teacherBusy' | 'classroomBusy' | 'classSectionBusy'
  conflictingSlot: TimetableSlot
}

/**
 * Places one lesson on the timetable, refusing any placement that would
 * double-book a teacher, a room, or a class section.
 *
 * The schema's three `prevent_*_collision` indexes exist to make these lookups
 * cheap; they do not enforce anything on their own, which is why the rule lives
 * here. Every write to timetableSlots must go through this function.
 */
export async function placeSlot(
  repo: TimetableRepository,
  input: PlaceSlotInput
): Promise<Result<TimetableSlot, SlotConflict>> {
  const cell = {
    termId: input.termId,
    dayOfWeek: input.dayOfWeek,
    periodId: input.periodId,
  }

  const [teacherClash, classroomClash, classSectionClash] = await Promise.all([
    repo.findByTeacher({ ...cell, teacherId: input.teacherId }),
    repo.findByClassroom({ ...cell, classroomId: input.classroomId }),
    repo.findByClassSection({ ...cell, classSectionId: input.classSectionId }),
  ])

  if (teacherClash) return err({ kind: 'teacherBusy', conflictingSlot: teacherClash })
  if (classroomClash) return err({ kind: 'classroomBusy', conflictingSlot: classroomClash })
  if (classSectionClash) {
    return err({ kind: 'classSectionBusy', conflictingSlot: classSectionClash })
  }

  const id = await repo.insert(input)
  return ok({ id, ...input })
}

/** Plain-language conflict text, in the voice set by docs/DESIGN.md section 6. */
export function describeConflict(conflict: SlotConflict): string {
  switch (conflict.kind) {
    case 'teacherBusy':
      return 'That teacher already has a lesson in this period.'
    case 'classroomBusy':
      return 'That room is already booked for this period.'
    case 'classSectionBusy':
      return 'That class is already taking another subject in this period.'
  }
}
