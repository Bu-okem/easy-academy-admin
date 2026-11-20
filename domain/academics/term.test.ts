import { describe, expect, it } from 'vitest'
import { asId } from '../ids'
import { inMemoryAcademicsRepository } from '../testing/inMemoryAcademicsRepository'
import { addTerm, describeTermProblem, type NewTerm } from './term'

const year = asId<'academicYears'>('year1')

const aTerm = (overrides: Partial<NewTerm> = {}): NewTerm => ({
  academicYearId: year,
  name: 'Term 2',
  startDate: '2027-01-11',
  endDate: '2027-04-02',
  ...overrides,
})

const repoWithTerm1 = () => {
  const repo = inMemoryAcademicsRepository()
  repo.seedTerms([
    { academicYearId: year, name: 'Term 1', startDate: '2026-09-07', endDate: '2026-12-11' },
  ])
  return repo
}

describe('addTerm', () => {
  it('adds a term that sits clear of the others', async () => {
    const repo = repoWithTerm1()

    const result = await addTerm(repo, aTerm())

    expect(result.ok).toBe(true)
    expect(repo.terms()).toHaveLength(2)
  })

  it('allows a single-day term', async () => {
    const repo = repoWithTerm1()

    const result = await addTerm(repo, aTerm({ startDate: '2027-01-11', endDate: '2027-01-11' }))

    expect(result.ok).toBe(true)
  })

  it('trims the name', async () => {
    const repo = repoWithTerm1()

    await addTerm(repo, aTerm({ name: '  Term 2  ' }))

    expect(repo.terms()[1]!.name).toBe('Term 2')
  })

  describe('overlaps', () => {
    it('refuses a term starting inside another', async () => {
      const repo = repoWithTerm1()

      const result = await addTerm(repo, aTerm({ startDate: '2026-11-01', endDate: '2027-02-01' }))

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toEqual({ kind: 'overlaps', withTerm: 'Term 1' })
      expect(repo.terms()).toHaveLength(1)
    })

    it('refuses a term that swallows another whole', async () => {
      const repo = repoWithTerm1()

      const result = await addTerm(repo, aTerm({ startDate: '2026-01-01', endDate: '2027-12-31' }))

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('overlaps')
    })

    it('refuses a term that starts the day the previous one ends', async () => {
      // Both ends are inclusive, so a shared day is a day in two terms.
      const repo = repoWithTerm1()

      const result = await addTerm(repo, aTerm({ startDate: '2026-12-11', endDate: '2027-03-01' }))

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('overlaps')
    })

    it('allows a term starting the day after the previous one ends', async () => {
      const repo = repoWithTerm1()

      const result = await addTerm(repo, aTerm({ startDate: '2026-12-12', endDate: '2027-03-01' }))

      expect(result.ok).toBe(true)
    })

    it('ignores terms belonging to a different year', async () => {
      const repo = repoWithTerm1()

      const result = await addTerm(
        repo,
        aTerm({
          academicYearId: asId<'academicYears'>('year2'),
          startDate: '2026-09-07',
          endDate: '2026-12-11',
        })
      )

      expect(result.ok).toBe(true)
    })
  })

  describe('dates', () => {
    it('refuses an end before the start', async () => {
      const repo = repoWithTerm1()

      const result = await addTerm(repo, aTerm({ startDate: '2027-04-02', endDate: '2027-01-11' }))

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('endBeforeStart')
    })

    it('refuses a malformed date', async () => {
      const repo = repoWithTerm1()

      const result = await addTerm(repo, aTerm({ startDate: '11/01/2027' }))

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('invalidDate')
    })

    it('refuses a date that does not exist', async () => {
      const repo = repoWithTerm1()

      const result = await addTerm(repo, aTerm({ endDate: '2027-02-30' }))

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('invalidDate')
    })
  })

  it('refuses a blank name', async () => {
    const repo = repoWithTerm1()

    const result = await addTerm(repo, aTerm({ name: '  ' }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('nameRequired')
  })
})

describe('describeTermProblem', () => {
  it('names the term that was overlapped', () => {
    expect(describeTermProblem({ kind: 'overlaps', withTerm: 'Term 1' })).toContain('Term 1')
  })
})
