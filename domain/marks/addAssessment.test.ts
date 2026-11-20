import { describe, expect, it } from 'vitest'
import { asId } from '../ids'
import { inMemoryMarksRepository } from '../testing/inMemoryMarksRepository'
import { addAssessment, describeAssessmentProblem } from './addAssessment'

const assignmentId = asId<'teachingAssignments'>('assign1')
const termId = asId<'terms'>('term1')

function repoWithAssignment() {
  const repo = inMemoryMarksRepository()
  repo.seedAssignment({ id: assignmentId, termId })
  return repo
}

describe('addAssessment', () => {
  it('creates an assessment with valid inputs', async () => {
    const repo = repoWithAssignment()

    const result = await addAssessment(repo, {
      assignmentId,
      name: '  Mid-term test  ',
      weight: 0.4,
      maxScore: 50,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.name).toBe('Mid-term test')
    expect(result.value.weight).toBe(0.4)
    expect(result.value.maxScore).toBe(50)
  })

  it('allows multiple assessments summing cleanly to 1.0', async () => {
    const repo = repoWithAssignment()
    await addAssessment(repo, { assignmentId, name: 'Mid-term', weight: 0.4, maxScore: 50 })

    const second = await addAssessment(repo, {
      assignmentId,
      name: 'Final exam',
      weight: 0.6,
      maxScore: 100,
    })

    expect(second.ok).toBe(true)
    expect(await repo.listAssessmentsForAssignment(assignmentId)).toHaveLength(2)
  })

  it('allows fractional weights that suffer float drift (0.1 + 0.2 + 0.7)', async () => {
    const repo = repoWithAssignment()
    await addAssessment(repo, { assignmentId, name: 'Quiz 1', weight: 0.1, maxScore: 20 })
    await addAssessment(repo, { assignmentId, name: 'Quiz 2', weight: 0.2, maxScore: 20 })

    const third = await addAssessment(repo, {
      assignmentId,
      name: 'Exam',
      weight: 0.7,
      maxScore: 100,
    })

    expect(third.ok).toBe(true)
  })

  it('refuses when total weight exceeds 1.0', async () => {
    const repo = repoWithAssignment()
    await addAssessment(repo, { assignmentId, name: 'Mid-term', weight: 0.4, maxScore: 50 })

    const second = await addAssessment(repo, {
      assignmentId,
      name: 'Final exam',
      weight: 0.7,
      maxScore: 100,
    })

    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error).toEqual({
      kind: 'weightExceedsTotal',
      currentWeight: 0.4,
      requestedWeight: 0.7,
    })
  })

  it('refuses when assignment does not exist', async () => {
    const repo = inMemoryMarksRepository()

    const result = await addAssessment(repo, {
      assignmentId,
      name: 'Mid-term',
      weight: 0.4,
      maxScore: 50,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('assignmentNotFound')
  })

  it('refuses a blank name', async () => {
    const repo = repoWithAssignment()

    const result = await addAssessment(repo, {
      assignmentId,
      name: '   ',
      weight: 0.4,
      maxScore: 50,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('nameRequired')
  })

  it.each([0, -0.1, 1.1, Number.NaN])('refuses invalid weight %s', async (weight) => {
    const repo = repoWithAssignment()

    const result = await addAssessment(repo, {
      assignmentId,
      name: 'Test',
      weight,
      maxScore: 100,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalidWeight')
  })

  it.each([0, -10, Number.NaN])('refuses invalid maxScore %s', async (maxScore) => {
    const repo = repoWithAssignment()

    const result = await addAssessment(repo, {
      assignmentId,
      name: 'Test',
      weight: 0.5,
      maxScore,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalidMaxScore')
  })

  it('describes weight exceedance in percentages', () => {
    expect(
      describeAssessmentProblem({
        kind: 'weightExceedsTotal',
        currentWeight: 0.4,
        requestedWeight: 0.7,
      })
    ).toContain('60%')
  })
})
