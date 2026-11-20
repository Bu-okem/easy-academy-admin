import { describe, expect, it } from 'vitest'
import { inMemoryAcademicsRepository } from '../testing/inMemoryAcademicsRepository'
import { addSubject, describeSubjectProblem, normaliseCode } from './subject'

describe('normaliseCode', () => {
  it('upper-cases and trims', () => {
    expect(normaliseCode('  math101 ')).toBe('MATH101')
  })

  it('removes inner spaces', () => {
    expect(normaliseCode('math 101')).toBe('MATH101')
  })
})

describe('addSubject', () => {
  it('stores a subject with its normalised code', async () => {
    const repo = inMemoryAcademicsRepository()

    const result = await addSubject(repo, { name: 'Mathematics', code: ' math 101 ' })

    expect(result.ok).toBe(true)
    expect(repo.subjects()[0]).toMatchObject({ name: 'Mathematics', code: 'MATH101' })
  })

  it('refuses a code already in use, however it was typed', async () => {
    const repo = inMemoryAcademicsRepository()
    repo.seedSubjects([{ name: 'Mathematics', code: 'MATH101' }])

    const result = await addSubject(repo, { name: 'Maths', code: 'math 101' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toEqual({ kind: 'duplicateCode', code: 'MATH101' })
    expect(repo.subjects()).toHaveLength(1)
  })

  it('allows a different code for a similarly named subject', async () => {
    const repo = inMemoryAcademicsRepository()
    repo.seedSubjects([{ name: 'Mathematics', code: 'MATH101' }])

    const result = await addSubject(repo, { name: 'Further Mathematics', code: 'MATH201' })

    expect(result.ok).toBe(true)
  })

  it('refuses a blank name', async () => {
    const repo = inMemoryAcademicsRepository()

    const result = await addSubject(repo, { name: '  ', code: 'ART101' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('nameRequired')
  })

  it('refuses a blank code', async () => {
    const repo = inMemoryAcademicsRepository()

    const result = await addSubject(repo, { name: 'Art', code: '   ' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('codeRequired')
  })
})

describe('describeSubjectProblem', () => {
  it('names the clashing code', () => {
    expect(describeSubjectProblem({ kind: 'duplicateCode', code: 'MATH101' })).toContain('MATH101')
  })
})
