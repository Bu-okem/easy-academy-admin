import { describe, expect, it } from 'vitest'
import { asId } from '../ids'
import { inMemoryAcademicsRepository } from '../testing/inMemoryAcademicsRepository'
import {
  addClassSection,
  addClassroom,
  addGradeLevel,
  addGradingBand,
  addPeriod,
  describeStructureProblem,
} from './structure'

describe('academics structure', () => {
  describe('addGradeLevel', () => {
    it('adds a trimmed grade level', async () => {
      const repo = inMemoryAcademicsRepository()
      const res = await addGradeLevel(repo, '  Grade 10  ')
      expect(res.ok).toBe(true)
      expect((await repo.listGradeLevels())[0]?.name).toBe('Grade 10')
    })

    it('refuses blank or duplicate names case-insensitively', async () => {
      const repo = inMemoryAcademicsRepository()
      await addGradeLevel(repo, 'Grade 10')

      const blank = await addGradeLevel(repo, '  ')
      const dup = await addGradeLevel(repo, 'grade 10')

      expect(blank.ok).toBe(false)
      if (!blank.ok) expect(blank.error.kind).toBe('nameRequired')
      expect(dup.ok).toBe(false)
      if (!dup.ok) expect(dup.error.kind).toBe('duplicateName')
    })
  })

  describe('addClassSection', () => {
    it('adds a section under an existing grade level', async () => {
      const repo = inMemoryAcademicsRepository()
      const grade = await addGradeLevel(repo, 'Grade 10')
      if (!grade.ok) return

      const res = await addClassSection(repo, {
        gradeLevelId: grade.value,
        sectionName: '  10A  ',
      })

      expect(res.ok).toBe(true)
      expect((await repo.listClassSections())[0]?.sectionName).toBe('10A')
    })

    it('refuses a missing grade level or duplicate section name', async () => {
      const repo = inMemoryAcademicsRepository()
      const missing = await addClassSection(repo, {
        gradeLevelId: asId<'gradeLevels'>('none'),
        sectionName: '10A',
      })
      expect(missing.ok).toBe(false)
      if (!missing.ok) expect(missing.error.kind).toBe('gradeNotFound')

      const grade = await addGradeLevel(repo, 'Grade 10')
      if (!grade.ok) return
      await addClassSection(repo, { gradeLevelId: grade.value, sectionName: '10A' })
      const dup = await addClassSection(repo, { gradeLevelId: grade.value, sectionName: '10a' })
      expect(dup.ok).toBe(false)
      if (!dup.ok) expect(dup.error.kind).toBe('duplicateName')
    })
  })

  describe('addClassroom', () => {
    it('adds a classroom with optional capacity and trimmed building', async () => {
      const repo = inMemoryAcademicsRepository()
      const res = await addClassroom(repo, {
        name: '  Lab 1  ',
        buildingName: '   ',
        capacity: 24,
      })

      expect(res.ok).toBe(true)
      const room = (await repo.listClassrooms())[0]
      expect(room?.name).toBe('Lab 1')
      expect(room?.buildingName).toBeUndefined()
      expect(room?.capacity).toBe(24)
    })

    it.each([0, -5, 12.5])('refuses invalid capacity %s', async (capacity) => {
      const repo = inMemoryAcademicsRepository()
      const res = await addClassroom(repo, { name: 'Room 1', capacity })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error.kind).toBe('invalidCapacity')
    })
  })

  describe('addPeriod', () => {
    it('allows adjacent periods that share a boundary minute', async () => {
      const repo = inMemoryAcademicsRepository()
      await addPeriod(repo, { name: 'Period 1', startTime: '08:00', endTime: '08:45', isBreak: false })
      const next = await addPeriod(repo, {
        name: 'Period 2',
        startTime: '08:45',
        endTime: '09:30',
        isBreak: false,
      })

      expect(next.ok).toBe(true)
    })

    it('refuses overlapping periods, bad times, and reversed ranges', async () => {
      const repo = inMemoryAcademicsRepository()
      await addPeriod(repo, { name: 'Period 1', startTime: '08:00', endTime: '08:45', isBreak: false })

      const badTime = await addPeriod(repo, {
        name: 'Bad',
        startTime: '25:00',
        endTime: '09:00',
        isBreak: false,
      })
      const reversed = await addPeriod(repo, {
        name: 'Rev',
        startTime: '09:00',
        endTime: '09:00',
        isBreak: false,
      })
      const overlap = await addPeriod(repo, {
        name: 'Clash',
        startTime: '08:30',
        endTime: '09:15',
        isBreak: false,
      })

      expect(!badTime.ok && badTime.error.kind).toBe('invalidTime')
      expect(!reversed.ok && reversed.error.kind).toBe('endBeforeStart')
      expect(!overlap.ok && overlap.error).toEqual({
        kind: 'overlapsPeriod',
        existingName: 'Period 1',
      })
    })
  })

  describe('addGradingBand', () => {
    it('adds a valid band and validates bounds', async () => {
      const repo = inMemoryAcademicsRepository()
      const valid = await addGradingBand(repo, {
        name: 'Standard',
        letterGrade: 'A',
        minScore: 70,
        maxScore: 100,
        gpaPoint: 4,
      })
      expect(valid.ok).toBe(true)

      const badRange = await addGradingBand(repo, {
        name: 'Standard',
        letterGrade: 'B',
        minScore: 80,
        maxScore: 70,
        gpaPoint: 3,
      })
      const badGpa = await addGradingBand(repo, {
        name: 'Standard',
        letterGrade: 'F',
        minScore: 0,
        maxScore: 39,
        gpaPoint: -1,
      })
      const noLetter = await addGradingBand(repo, {
        name: 'Standard',
        letterGrade: '  ',
        minScore: 0,
        maxScore: 39,
        gpaPoint: 0,
      })

      expect(!badRange.ok && badRange.error.kind).toBe('invalidScoreRange')
      expect(!badGpa.ok && badGpa.error.kind).toBe('invalidGpaPoint')
      expect(!noLetter.ok && noLetter.error.kind).toBe('letterGradeRequired')
    })
  })

  it('produces plain-language error messages', () => {
    expect(describeStructureProblem({ kind: 'overlapsPeriod', existingName: 'Break' })).toContain(
      'Break'
    )
  })
})
