import { describe, expect, it } from 'vitest'
import { asId } from '../ids'
import { inMemoryResultsRepository } from '../testing/inMemoryResultsRepository'
import type { TermSummary } from './ports'
import {
  describePublishProblem,
  publishTermSummary,
  withdrawTermSummary,
} from './publishTermSummary'

const studentId = asId<'students'>('student1')
const termId = asId<'terms'>('term1')

const aSummary = (overrides: Partial<Omit<TermSummary, 'id'>> = {}): Omit<TermSummary, 'id'> => ({
  studentId,
  termId,
  classSectionId: asId<'classSections'>('section10A'),
  totalDaysPresent: 58,
  totalDaysAbsent: 2,
  termGpa: 3.4,
  isPublished: false,
  ...overrides,
})

/** A summary that is complete and has subject results - ready to publish. */
const readyRepo = (overrides: Partial<Omit<TermSummary, 'id'>> = {}) => {
  const repo = inMemoryResultsRepository()
  const [id] = repo.seed([aSummary(overrides)])
  repo.seedSubjectResultCount({ studentId, termId }, 8)
  return { repo, id: id! }
}

describe('publishTermSummary', () => {
  describe('publishing a complete report card', () => {
    it('marks it published', async () => {
      const { repo, id } = readyRepo()

      const result = await publishTermSummary(repo, id)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.isPublished).toBe(true)
      expect(repo.rows()[0]!.isPublished).toBe(true)
    })

    it('publishes with remarks left blank, which are optional', async () => {
      const { repo, id } = readyRepo({ formTeacherRemark: undefined, principalRemark: undefined })

      const result = await publishTermSummary(repo, id)

      expect(result.ok).toBe(true)
    })

    it('publishes a summary with zero days absent', async () => {
      const { repo, id } = readyRepo({ totalDaysAbsent: 0 })

      const result = await publishTermSummary(repo, id)

      expect(result.ok).toBe(true)
    })

    it('publishes a summary with a GPA of zero', async () => {
      const { repo, id } = readyRepo({ termGpa: 0 })

      const result = await publishTermSummary(repo, id)

      expect(result.ok).toBe(true)
    })
  })

  describe('refuses to publish an unfinished report card', () => {
    it('refuses when the GPA has not been calculated', async () => {
      const { repo, id } = readyRepo({ termGpa: undefined })

      const result = await publishTermSummary(repo, id)

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toEqual({ kind: 'incomplete', missing: ['term GPA'] })
      expect(repo.rows()[0]!.isPublished).toBe(false)
    })

    it('lists every missing field at once, not just the first', async () => {
      const { repo, id } = readyRepo({
        termGpa: undefined,
        totalDaysPresent: undefined,
        totalDaysAbsent: undefined,
      })

      const result = await publishTermSummary(repo, id)

      expect(result.ok).toBe(false)
      if (result.ok) return
      if (result.error.kind !== 'incomplete') throw new Error('wrong problem')
      expect(result.error.missing).toEqual(['term GPA', 'days present', 'days absent'])
    })

    it('refuses when the report card has no subject results', async () => {
      const repo = inMemoryResultsRepository()
      const [id] = repo.seed([aSummary()]) // no subject results seeded

      const result = await publishTermSummary(repo, id!)

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('noSubjectResults')
      expect(repo.rows()[0]!.isPublished).toBe(false)
    })

    it('refuses to publish twice', async () => {
      const { repo, id } = readyRepo({ isPublished: true })

      const result = await publishTermSummary(repo, id)

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('alreadyPublished')
    })

    it('refuses a summary that does not exist', async () => {
      const repo = inMemoryResultsRepository()

      const result = await publishTermSummary(repo, asId<'termSummaries'>('nope'))

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('summaryNotFound')
    })
  })

  describe('withdrawing a published report card', () => {
    it('hides it again', async () => {
      const { repo, id } = readyRepo({ isPublished: true })

      const result = await withdrawTermSummary(repo, id)

      expect(result.ok).toBe(true)
      expect(repo.rows()[0]!.isPublished).toBe(false)
    })

    it('refuses to withdraw one that was never published', async () => {
      const { repo, id } = readyRepo()

      const result = await withdrawTermSummary(repo, id)

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('notPublished')
    })

    it('does not require completeness to withdraw', async () => {
      const { repo, id } = readyRepo({ isPublished: true, termGpa: undefined })

      const result = await withdrawTermSummary(repo, id)

      expect(result.ok).toBe(true)
    })
  })

  describe('describePublishProblem', () => {
    it('lists one missing field plainly', () => {
      expect(describePublishProblem({ kind: 'incomplete', missing: ['term GPA'] })).toBe(
        'This report card still needs term GPA.'
      )
    })

    it('joins several missing fields readably', () => {
      const message = describePublishProblem({
        kind: 'incomplete',
        missing: ['term GPA', 'days present', 'days absent'],
      })

      expect(message).toBe(
        'This report card still needs term GPA, days present and days absent.'
      )
    })
  })
})
