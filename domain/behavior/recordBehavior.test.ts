import { describe, expect, it } from 'vitest'
import { asId } from '../ids'
import { inMemoryBehaviorRepository } from '../testing/inMemoryBehaviorRepository'
import {
  describeBehaviorProblem,
  recordBehavior,
  type RecordBehaviorInput,
} from './recordBehavior'

const term = {
  id: asId<'terms'>('term1'),
  startDate: '2026-09-01',
  endDate: '2026-12-18',
}

const anIncident = (overrides: Partial<RecordBehaviorInput> = {}): RecordBehaviorInput => ({
  studentId: asId<'students'>('student1'),
  teacherId: asId<'teachers'>('teacher1'),
  termId: term.id,
  type: 'merit',
  severityLevel: 2,
  description: 'Helped organise the science lab.',
  incidentDate: '2026-10-14',
  ...overrides,
})

function repoWithTerm() {
  const repo = inMemoryBehaviorRepository()
  repo.seedTerm(term)
  return repo
}

describe('recordBehavior', () => {
  it('records a merit with trimmed description and optional action', async () => {
    const repo = repoWithTerm()

    const result = await recordBehavior(
      repo,
      anIncident({
        description: '  Helped organise the science lab.  ',
        actionTaken: '  House point awarded  ',
      })
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.description).toBe('Helped organise the science lab.')
    expect(result.value.actionTaken).toBe('House point awarded')
    expect(repo.rows()).toHaveLength(1)
  })

  it('drops whitespace-only actionTaken to undefined', async () => {
    const repo = repoWithTerm()

    const result = await recordBehavior(
      repo,
      anIncident({ type: 'demerit', severityLevel: 3, actionTaken: '   ' })
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.actionTaken).toBeUndefined()
  })

  it('accepts boundary severities 1 and 5 and boundary term dates', async () => {
    const repo = repoWithTerm()

    const low = await recordBehavior(
      repo,
      anIncident({ severityLevel: 1, incidentDate: term.startDate })
    )
    const high = await recordBehavior(
      repo,
      anIncident({ severityLevel: 5, incidentDate: term.endDate })
    )

    expect(low.ok).toBe(true)
    expect(high.ok).toBe(true)
  })

  it('refuses an empty description', async () => {
    const repo = repoWithTerm()

    const result = await recordBehavior(repo, anIncident({ description: '   ' }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('descriptionRequired')
    expect(repo.rows()).toHaveLength(0)
  })

  it.each([0, 6, 2.5, Number.NaN])('refuses invalid severity %s', async (severityLevel) => {
    const repo = repoWithTerm()

    const result = await recordBehavior(repo, anIncident({ severityLevel }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalidSeverity')
  })

  it('refuses an invalid ISO date', async () => {
    const repo = repoWithTerm()

    const result = await recordBehavior(repo, anIncident({ incidentDate: '2026-02-30' }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalidDate')
  })

  it('refuses when the term does not exist', async () => {
    const repo = inMemoryBehaviorRepository()

    const result = await recordBehavior(repo, anIncident())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('termNotFound')
  })

  it('refuses a date outside the term', async () => {
    const repo = repoWithTerm()

    const result = await recordBehavior(repo, anIncident({ incidentDate: '2027-01-10' }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('dateOutsideTerm')
  })

  it('describes out-of-term refusals with the term boundaries', () => {
    const message = describeBehaviorProblem({
      kind: 'dateOutsideTerm',
      date: '2027-01-10',
      startDate: '2026-09-01',
      endDate: '2026-12-18',
    })
    expect(message).toContain('2026-09-01')
    expect(message).toContain('2026-12-18')
  })
})
