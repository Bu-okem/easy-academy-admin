import { asId } from '../ids'
import type {
  SlotCoordinate,
  TimetableRepository,
  TimetableSlot,
} from '../timetable/ports'

export interface InMemoryTimetableRepository extends TimetableRepository {
  /** Everything currently stored, so a test can assert what was (not) written. */
  rows(): readonly TimetableSlot[]
  /** Place slots directly, bypassing the rules, to set up a starting state. */
  seed(slots: ReadonlyArray<Omit<TimetableSlot, 'id'>>): void
}

/**
 * A timetable store that is not Convex. It exists to prove the domain layer
 * runs against any backend, and to let the scheduling rules be tested with no
 * deployment, no network, and no Nuxt runtime.
 */
export function inMemoryTimetableRepository(): InMemoryTimetableRepository {
  const slots: TimetableSlot[] = []
  let sequence = 0

  const add = (slot: Omit<TimetableSlot, 'id'>) => {
    const id = asId<'timetableSlots'>(`slot_${++sequence}`)
    slots.push({ id, ...slot })
    return id
  }

  const inCell = (slot: TimetableSlot, cell: SlotCoordinate) =>
    slot.termId === cell.termId &&
    slot.dayOfWeek === cell.dayOfWeek &&
    slot.periodId === cell.periodId

  return {
    async findByTeacher(where) {
      return slots.find((s) => inCell(s, where) && s.teacherId === where.teacherId) ?? null
    },
    async findByClassroom(where) {
      return slots.find((s) => inCell(s, where) && s.classroomId === where.classroomId) ?? null
    },
    async findByClassSection(where) {
      return slots.find((s) => inCell(s, where) && s.classSectionId === where.classSectionId) ?? null
    },
    async insert(slot) {
      return add(slot)
    },
    rows: () => slots,
    seed(seeded) {
      seeded.forEach(add)
    },
  }
}
