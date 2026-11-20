import { describe, expect, it } from 'vitest'
import { asId } from '../ids'
import { inMemoryAttendanceRepository } from '../testing/inMemoryAttendanceRepository'
import {
  describeAttendanceProblem,
  recordAttendance,
  type RecordAttendanceInput,
} from './recordAttendance'

const term = {
  id: asId<'terms'>('term1'),
  startDate: '2025-01-06',
  endDate: '2025-04-04',
}

const anEntry = (overrides: Partial<RecordAttendanceInput> = {}): RecordAttendanceInput => ({
  studentId: asId<'students'>('student1'),
  classSectionId: asId<'classSections'>('section10A'),
  teacherId: asId<'teachers'>('teacher1'),
  termId: term.id,
  attendanceDate: '2025-02-10',
  status: 'present',
  ...overrides,
})

const repoWithTerm = () => {
  const repo = inMemoryAttendanceRepository()
  repo.seedTerm(term)
  return repo
}

describe('recordAttendance', () => {
  describe('taking the register', () => {
    it('records a first entry for the day', async () => {
      const repo = repoWithTerm()

      const result = await recordAttendance(repo, anEntry())

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.outcome).toBe('recorded')
      expect(result.value.record.status).toBe('present')
      expect(repo.rows()).toHaveLength(1)
    })

    it('keeps entries for different students apart', async () => {
      const repo = repoWithTerm()
      await recordAttendance(repo, anEntry())

      await recordAttendance(repo, anEntry({ studentId: asId<'students'>('student2') }))

      expect(repo.rows()).toHaveLength(2)
    })

    it('keeps entries for different days apart', async () => {
      const repo = repoWithTerm()
      await recordAttendance(repo, anEntry())

      await recordAttendance(repo, anEntry({ attendanceDate: '2025-02-11' }))

      expect(repo.rows()).toHaveLength(2)
    })
  })

  describe('one status per student per day', () => {
    it('amends the existing entry instead of adding a second', async () => {
      const repo = repoWithTerm()
      await recordAttendance(repo, anEntry({ status: 'absent' }))

      const result = await recordAttendance(
        repo,
        anEntry({ status: 'excused', remarks: 'Medical appointment' })
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.outcome).toBe('corrected')
      expect(repo.rows()).toHaveLength(1)
      expect(repo.rows()[0]!.status).toBe('excused')
      expect(repo.rows()[0]!.remarks).toBe('Medical appointment')
    })

    it('keeps the original record id when correcting', async () => {
      const repo = repoWithTerm()
      const first = await recordAttendance(repo, anEntry({ status: 'absent' }))
      if (!first.ok) throw new Error('setup failed')

      const corrected = await recordAttendance(repo, anEntry({ status: 'present' }))

      expect(corrected.ok).toBe(true)
      if (!corrected.ok) return
      expect(corrected.value.record.id).toBe(first.value.record.id)
    })

    it('clears a remark that was removed during a correction', async () => {
      const repo = repoWithTerm()
      await recordAttendance(repo, anEntry({ status: 'late', remarks: 'Bus delay' }))

      await recordAttendance(repo, anEntry({ status: 'present' }))

      expect(repo.rows()[0]!.remarks).toBeUndefined()
    })
  })

  describe('refuses entries the calendar does not allow', () => {
    it('refuses a malformed date', async () => {
      const repo = repoWithTerm()

      const result = await recordAttendance(repo, anEntry({ attendanceDate: '10/02/2025' }))

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('invalidDate')
      expect(repo.rows()).toHaveLength(0)
    })

    it('refuses a date that does not exist', async () => {
      const repo = repoWithTerm()

      const result = await recordAttendance(repo, anEntry({ attendanceDate: '2025-02-30' }))

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('invalidDate')
    })

    it('refuses a date before the term starts', async () => {
      const repo = repoWithTerm()

      const result = await recordAttendance(repo, anEntry({ attendanceDate: '2025-01-05' }))

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('dateOutsideTerm')
    })

    it('refuses a date after the term ends', async () => {
      const repo = repoWithTerm()

      const result = await recordAttendance(repo, anEntry({ attendanceDate: '2025-04-05' }))

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('dateOutsideTerm')
    })

    it('accepts the first and last day of term', async () => {
      const repo = repoWithTerm()

      const first = await recordAttendance(repo, anEntry({ attendanceDate: '2025-01-06' }))
      const last = await recordAttendance(repo, anEntry({ attendanceDate: '2025-04-04' }))

      expect(first.ok).toBe(true)
      expect(last.ok).toBe(true)
    })

    it('refuses when the term is missing', async () => {
      const repo = inMemoryAttendanceRepository() // no term seeded

      const result = await recordAttendance(repo, anEntry())

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('termNotFound')
      expect(repo.rows()).toHaveLength(0)
    })
  })

  describe('describeAttendanceProblem', () => {
    it('names the offending date', () => {
      expect(describeAttendanceProblem({ kind: 'invalidDate', date: '10/02/2025' })).toContain(
        '10/02/2025'
      )
    })

    it('states the term window a user must stay inside', () => {
      const message = describeAttendanceProblem({
        kind: 'dateOutsideTerm',
        date: '2025-04-05',
        termStart: '2025-01-06',
        termEnd: '2025-04-04',
      })

      expect(message).toContain('2025-01-06')
      expect(message).toContain('2025-04-04')
    })
  })
})
