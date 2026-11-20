import { describe, expect, it } from 'vitest'
import { asId } from '../ids'
import { inMemoryTimetableRepository } from '../testing/inMemoryTimetableRepository'
import { aSlot } from '../testing/timetableFixtures'
import { describeConflict, placeSlot, type SlotConflict } from './placeSlot'

describe('placeSlot', () => {
  describe('accepts a placement when the cell is free', () => {
    it('stores the slot and returns it with an id', async () => {
      const repo = inMemoryTimetableRepository()

      const result = await placeSlot(repo, aSlot())

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.id).toBeTruthy()
      expect(result.value.subjectId).toBe('maths')
      expect(repo.rows()).toHaveLength(1)
    })

    it('lets the same teacher take another class in a later period', async () => {
      const repo = inMemoryTimetableRepository()
      repo.seed([aSlot()])

      const result = await placeSlot(
        repo,
        aSlot({ periodId: asId<'periods'>('period2'), classSectionId: asId<'classSections'>('section10B') })
      )

      expect(result.ok).toBe(true)
      expect(repo.rows()).toHaveLength(2)
    })

    it('lets the same teacher, room and class repeat on another weekday', async () => {
      const repo = inMemoryTimetableRepository()
      repo.seed([aSlot()])

      const result = await placeSlot(repo, aSlot({ dayOfWeek: 'Tuesday' }))

      expect(result.ok).toBe(true)
    })

    it('does not treat a different term as a clash', async () => {
      const repo = inMemoryTimetableRepository()
      repo.seed([aSlot()])

      const result = await placeSlot(repo, aSlot({ termId: asId<'terms'>('term2') }))

      expect(result.ok).toBe(true)
    })
  })

  describe('refuses a placement that would double-book', () => {
    it('refuses to put a teacher in two rooms at once', async () => {
      const repo = inMemoryTimetableRepository()
      repo.seed([aSlot()])

      const result = await placeSlot(
        repo,
        aSlot({
          classroomId: asId<'classrooms'>('room2'),
          classSectionId: asId<'classSections'>('section10B'),
        })
      )

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('teacherBusy')
    })

    it('refuses to put two classes in one room at once', async () => {
      const repo = inMemoryTimetableRepository()
      repo.seed([aSlot()])

      const result = await placeSlot(
        repo,
        aSlot({
          teacherId: asId<'teachers'>('teacher2'),
          classSectionId: asId<'classSections'>('section10B'),
        })
      )

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('classroomBusy')
    })

    it('refuses to give one class two subjects at once', async () => {
      const repo = inMemoryTimetableRepository()
      repo.seed([aSlot()])

      const result = await placeSlot(
        repo,
        aSlot({
          teacherId: asId<'teachers'>('teacher2'),
          classroomId: asId<'classrooms'>('room2'),
          subjectId: asId<'subjects'>('english'),
        })
      )

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('classSectionBusy')
    })

    it('writes nothing when it refuses', async () => {
      const repo = inMemoryTimetableRepository()
      repo.seed([aSlot()])

      await placeSlot(repo, aSlot({ subjectId: asId<'subjects'>('english') }))

      expect(repo.rows()).toHaveLength(1)
    })
  })

  describe('reports enough for the UI to name the clash', () => {
    it('returns the slot already occupying the cell', async () => {
      const repo = inMemoryTimetableRepository()
      repo.seed([aSlot()])
      const [existing] = repo.rows()

      const result = await placeSlot(
        repo,
        aSlot({ classroomId: asId<'classrooms'>('room2'), classSectionId: asId<'classSections'>('section10B') })
      )

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.conflictingSlot.id).toBe(existing!.id)
      expect(result.error.conflictingSlot.subjectId).toBe('maths')
    })

    it('reports the teacher clash first when several apply at once', async () => {
      const repo = inMemoryTimetableRepository()
      repo.seed([aSlot()])

      // Identical placement: teacher, room and class all clash. The order is
      // deterministic so the message a user sees never changes run to run.
      const result = await placeSlot(repo, aSlot({ subjectId: asId<'subjects'>('english') }))

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('teacherBusy')
    })
  })

  describe('describeConflict', () => {
    const kinds: SlotConflict['kind'][] = ['teacherBusy', 'classroomBusy', 'classSectionBusy']

    it.each(kinds)('gives %s a plain-language message', (kind) => {
      const message = describeConflict({
        kind,
        conflictingSlot: { id: asId<'timetableSlots'>('slot_1'), ...aSlot() },
      })

      expect(message).toMatch(/^[A-Z].*\.$/)
    })
  })
})
