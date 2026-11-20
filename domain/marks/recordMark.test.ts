import { describe, expect, it } from 'vitest'
import { asId } from '../ids'
import { inMemoryMarksRepository } from '../testing/inMemoryMarksRepository'
import { describeMarkProblem, recordMark, type RecordMarkInput } from './recordMark'

const assessment = {
  id: asId<'assessments'>('midterm'),
  name: 'Mid-term test',
  maxScore: 50,
}

const aMark = (overrides: Partial<RecordMarkInput> = {}): RecordMarkInput => ({
  assessmentId: assessment.id,
  studentId: asId<'students'>('student1'),
  score: 42,
  status: 'present',
  ...overrides,
})

const repoWithAssessment = () => {
  const repo = inMemoryMarksRepository()
  repo.seedAssessment(assessment)
  return repo
}

describe('recordMark', () => {
  describe('entering marks', () => {
    it('records a score for a student who sat the test', async () => {
      const repo = repoWithAssessment()

      const result = await recordMark(repo, aMark())

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.outcome).toBe('recorded')
      expect(result.value.mark.score).toBe(42)
      expect(repo.rows()).toHaveLength(1)
    })

    it('accepts the boundary scores', async () => {
      const repo = repoWithAssessment()

      const zero = await recordMark(repo, aMark({ score: 0 }))
      const full = await recordMark(
        repo,
        aMark({ studentId: asId<'students'>('student2'), score: 50 })
      )

      expect(zero.ok).toBe(true)
      expect(full.ok).toBe(true)
    })

    it('accepts a fractional score', async () => {
      const repo = repoWithAssessment()

      const result = await recordMark(repo, aMark({ score: 37.5 }))

      expect(result.ok).toBe(true)
    })

    it('records a student who did not sit the test, with no score', async () => {
      const repo = repoWithAssessment()

      const result = await recordMark(repo, aMark({ status: 'absent', score: undefined }))

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.mark.score).toBeUndefined()
      expect(result.value.mark.status).toBe('absent')
    })
  })

  describe('one mark per student per assessment', () => {
    it('amends the existing mark instead of adding a second', async () => {
      const repo = repoWithAssessment()
      await recordMark(repo, aMark({ score: 30 }))

      const result = await recordMark(repo, aMark({ score: 44 }))

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.outcome).toBe('corrected')
      expect(repo.rows()).toHaveLength(1)
      expect(repo.rows()[0]!.score).toBe(44)
    })

    it('drops the score when a sat mark is corrected to absent', async () => {
      const repo = repoWithAssessment()
      await recordMark(repo, aMark({ score: 30 }))

      await recordMark(repo, aMark({ status: 'excused', score: undefined }))

      expect(repo.rows()[0]!.score).toBeUndefined()
      expect(repo.rows()[0]!.status).toBe('excused')
    })

    it('keeps marks for different students apart', async () => {
      const repo = repoWithAssessment()
      await recordMark(repo, aMark())

      await recordMark(repo, aMark({ studentId: asId<'students'>('student2') }))

      expect(repo.rows()).toHaveLength(2)
    })
  })

  describe('refuses marks that would corrupt an average', () => {
    it('refuses a score above the assessment maximum', async () => {
      const repo = repoWithAssessment()

      const result = await recordMark(repo, aMark({ score: 51 }))

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toEqual({ kind: 'scoreOutOfRange', score: 51, maxScore: 50 })
      expect(repo.rows()).toHaveLength(0)
    })

    it('refuses a negative score', async () => {
      const repo = repoWithAssessment()

      const result = await recordMark(repo, aMark({ score: -1 }))

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('scoreOutOfRange')
    })

    it('refuses a score that is not a number', async () => {
      const repo = repoWithAssessment()

      const result = await recordMark(repo, aMark({ score: Number.NaN }))

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('scoreOutOfRange')
    })

    it('refuses a present student with no score', async () => {
      const repo = repoWithAssessment()

      const result = await recordMark(repo, aMark({ score: undefined }))

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('scoreRequired')
    })

    it('refuses a score on an absent student', async () => {
      const repo = repoWithAssessment()

      const result = await recordMark(repo, aMark({ status: 'absent', score: 0 }))

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('scoreNotAllowed')
      expect(repo.rows()).toHaveLength(0)
    })

    it('refuses a mark for an assessment that does not exist', async () => {
      const repo = inMemoryMarksRepository() // nothing seeded

      const result = await recordMark(repo, aMark())

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('assessmentNotFound')
    })
  })

  describe('describeMarkProblem', () => {
    it('states the assessment maximum when a score is too high', () => {
      const message = describeMarkProblem({ kind: 'scoreOutOfRange', score: 51, maxScore: 50 })

      expect(message).toContain('51')
      expect(message).toContain('50')
    })

    it('names the status that forbids a score', () => {
      expect(describeMarkProblem({ kind: 'scoreNotAllowed', status: 'excused' })).toContain(
        'excused'
      )
    })
  })
})
