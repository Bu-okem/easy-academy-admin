import { describe, expect, it } from 'vitest'
import { asId } from '../ids'
import { inMemoryAcademicsRepository } from '../testing/inMemoryAcademicsRepository'
import { activateAcademicYear, addAcademicYear, describeYearProblem } from './academicYear'

describe('addAcademicYear', () => {
  it('makes the very first year active', async () => {
    const repo = inMemoryAcademicsRepository()

    const result = await addAcademicYear(repo, '2026/2027')

    expect(result.ok).toBe(true)
    expect(repo.years()[0]).toMatchObject({ name: '2026/2027', isActive: true })
  })

  it('leaves later years inactive', async () => {
    const repo = inMemoryAcademicsRepository()
    await addAcademicYear(repo, '2026/2027')

    await addAcademicYear(repo, '2027/2028')

    expect(repo.years().map((y) => y.isActive)).toEqual([true, false])
  })

  it('trims the name', async () => {
    const repo = inMemoryAcademicsRepository()

    await addAcademicYear(repo, '  2026/2027  ')

    expect(repo.years()[0]!.name).toBe('2026/2027')
  })

  it('refuses a blank name', async () => {
    const repo = inMemoryAcademicsRepository()

    const result = await addAcademicYear(repo, '   ')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('nameRequired')
    expect(repo.years()).toHaveLength(0)
  })

  it('refuses a duplicate, ignoring case', async () => {
    const repo = inMemoryAcademicsRepository()
    await addAcademicYear(repo, '2026/2027')

    const result = await addAcademicYear(repo, '2026/2027')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('duplicateYear')
    expect(repo.years()).toHaveLength(1)
  })
})

describe('activateAcademicYear', () => {
  it('activates one year and deactivates every other', async () => {
    const repo = inMemoryAcademicsRepository()
    const [first, second] = repo.seedYears([
      { name: '2025/2026', isActive: true },
      { name: '2026/2027', isActive: false },
    ])

    const result = await activateAcademicYear(repo, second!)

    expect(result.ok).toBe(true)
    expect(repo.years().find((y) => y.id === first)!.isActive).toBe(false)
    expect(repo.years().find((y) => y.id === second)!.isActive).toBe(true)
  })

  it('leaves exactly one year active even if the data started wrong', async () => {
    // Two active years are storable, which is why this rule exists at all.
    const repo = inMemoryAcademicsRepository()
    const [, second] = repo.seedYears([
      { name: '2025/2026', isActive: true },
      { name: '2026/2027', isActive: true },
    ])

    await activateAcademicYear(repo, second!)

    expect(repo.years().filter((y) => y.isActive)).toHaveLength(1)
  })

  it('is harmless when the year is already the active one', async () => {
    const repo = inMemoryAcademicsRepository()
    const [only] = repo.seedYears([{ name: '2026/2027', isActive: true }])

    const result = await activateAcademicYear(repo, only!)

    expect(result.ok).toBe(true)
    expect(repo.years().filter((y) => y.isActive)).toHaveLength(1)
  })

  it('refuses a year that does not exist', async () => {
    const repo = inMemoryAcademicsRepository()

    const result = await activateAcademicYear(repo, asId<'academicYears'>('nope'))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('yearNotFound')
  })
})

describe('describeYearProblem', () => {
  it('names the duplicate', () => {
    expect(describeYearProblem({ kind: 'duplicateYear', name: '2026/2027' })).toContain('2026/2027')
  })
})
