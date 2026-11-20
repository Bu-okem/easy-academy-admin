import { describe, expect, it } from 'vitest'
import { asId } from '../ids'
import { inMemoryAttendanceRepository } from '../testing/inMemoryAttendanceRepository'
import {
  describeRegisterProblem,
  recordClassRegister,
  type ClassRegister,
  type RegisterEntry,
} from './recordClassRegister'

const term = { id: asId<'terms'>('term1'), startDate: '2026-09-07', endDate: '2026-12-11' }
const section = asId<'classSections'>('section10A')

const student = (n: number) => asId<'students'>(`student${n}`)

const entry = (n: number, status: RegisterEntry['status'] = 'present'): RegisterEntry => ({
  studentId: student(n),
  status,
})

const aRegister = (overrides: Partial<ClassRegister> = {}): ClassRegister => ({
  classSectionId: section,
  teacherId: asId<'teachers'>('teacher1'),
  termId: term.id,
  attendanceDate: '2026-09-23',
  entries: [entry(1), entry(2), entry(3)],
  ...overrides,
})

const repoWithTerm = () => {
  const repo = inMemoryAttendanceRepository()
  repo.seedTerm(term)
  return repo
}

describe('recordClassRegister', () => {
  describe('taking a register', () => {
    it('writes one entry per student', async () => {
      const repo = repoWithTerm()

      const result = await recordClassRegister(repo, aRegister())

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value).toEqual({ recorded: 3, corrected: 0 })
      expect(repo.rows()).toHaveLength(3)
    })

    it('keeps each student their own status', async () => {
      const repo = repoWithTerm()

      await recordClassRegister(
        repo,
        aRegister({ entries: [entry(1, 'present'), entry(2, 'absent'), entry(3, 'late')] })
      )

      expect(repo.rows().map((row) => row.status)).toEqual(['present', 'absent', 'late'])
    })

    it('carries a remark through', async () => {
      const repo = repoWithTerm()

      await recordClassRegister(
        repo,
        aRegister({ entries: [{ studentId: student(1), status: 'late', remarks: 'Bus delay' }] })
      )

      expect(repo.rows()[0]!.remarks).toBe('Bus delay')
    })
  })

  describe('re-taking a register', () => {
    it('corrects the existing entries instead of adding more', async () => {
      const repo = repoWithTerm()
      await recordClassRegister(repo, aRegister())

      const result = await recordClassRegister(
        repo,
        aRegister({ entries: [entry(1, 'absent'), entry(2), entry(3)] })
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value).toEqual({ recorded: 0, corrected: 3 })
      expect(repo.rows()).toHaveLength(3)
      expect(repo.rows()[0]!.status).toBe('absent')
    })

    it('counts a partly new register as both', async () => {
      const repo = repoWithTerm()
      await recordClassRegister(repo, aRegister({ entries: [entry(1)] }))

      const result = await recordClassRegister(repo, aRegister())

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value).toEqual({ recorded: 2, corrected: 1 })
    })
  })

  describe('refusals, none of which write anything', () => {
    it('refuses an empty register', async () => {
      const repo = repoWithTerm()

      const result = await recordClassRegister(repo, aRegister({ entries: [] }))

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('emptyRegister')
      expect(repo.rows()).toHaveLength(0)
    })

    it('refuses the same student appearing twice', async () => {
      const repo = repoWithTerm()

      const result = await recordClassRegister(
        repo,
        aRegister({ entries: [entry(1, 'present'), entry(1, 'absent')] })
      )

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toEqual({ kind: 'duplicateStudent', count: 1 })
      expect(repo.rows()).toHaveLength(0)
    })

    it('refuses a date outside the term before writing anyone', async () => {
      const repo = repoWithTerm()

      const result = await recordClassRegister(repo, aRegister({ attendanceDate: '2026-12-12' }))

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('dateOutsideTerm')
      // The whole point of validating first: no half-written register.
      expect(repo.rows()).toHaveLength(0)
    })

    it('refuses a malformed date before writing anyone', async () => {
      const repo = repoWithTerm()

      const result = await recordClassRegister(repo, aRegister({ attendanceDate: '23/09/2026' }))

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('invalidDate')
      expect(repo.rows()).toHaveLength(0)
    })

    it('refuses when the term is missing', async () => {
      const repo = inMemoryAttendanceRepository() // no term seeded

      const result = await recordClassRegister(repo, aRegister())

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('termNotFound')
      expect(repo.rows()).toHaveLength(0)
    })

    it('leaves a previously taken register untouched when it refuses', async () => {
      const repo = repoWithTerm()
      await recordClassRegister(repo, aRegister())

      await recordClassRegister(repo, aRegister({ attendanceDate: '2026-12-31' }))

      expect(repo.rows()).toHaveLength(3)
      expect(repo.rows().every((row) => row.status === 'present')).toBe(true)
    })
  })

  describe('describeRegisterProblem', () => {
    it('explains a duplicate plainly', () => {
      expect(describeRegisterProblem({ kind: 'duplicateStudent', count: 1 })).toContain(
        'more than once'
      )
    })

    it('states the term window', () => {
      const message = describeRegisterProblem({
        kind: 'dateOutsideTerm',
        date: '2026-12-12',
        termStart: '2026-09-07',
        termEnd: '2026-12-11',
      })

      expect(message).toContain('2026-12-11')
    })
  })
})
