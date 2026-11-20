import { describe, expect, it } from 'vitest'
import { asId } from '../ids'
import { bandFor, uncoveredScores, type GradingBand } from './gradingScale'

const band = (letterGrade: string, minScore: number, maxScore: number, gpaPoint: number): GradingBand => ({
  id: asId<'gradingScales'>(`band_${letterGrade}`),
  name: 'Standard',
  letterGrade,
  minScore,
  maxScore,
  gpaPoint,
})

const standard = [
  band('A', 70, 100, 4),
  band('B', 60, 69, 3),
  band('C', 50, 59, 2),
  band('D', 40, 49, 1),
  band('F', 0, 39, 0),
]

describe('bandFor', () => {
  it('grades a score inside a band', () => {
    expect(bandFor(standard, 65)?.letterGrade).toBe('B')
  })

  it('treats band bounds as inclusive at both ends', () => {
    expect(bandFor(standard, 60)?.letterGrade).toBe('B')
    expect(bandFor(standard, 69)?.letterGrade).toBe('B')
  })

  it('grades the extremes', () => {
    expect(bandFor(standard, 0)?.letterGrade).toBe('F')
    expect(bandFor(standard, 100)?.letterGrade).toBe('A')
  })

  it('carries the GPA point with the letter', () => {
    expect(bandFor(standard, 72)?.gpaPoint).toBe(4)
  })

  it('returns nothing for a score outside every band', () => {
    expect(bandFor(standard, 101)).toBeNull()
    expect(bandFor(standard, -1)).toBeNull()
  })

  it('returns nothing rather than guessing when the rulebook is empty', () => {
    expect(bandFor([], 65)).toBeNull()
  })

  it('awards the higher band when a misconfigured rulebook overlaps', () => {
    const overlapping = [band('B', 60, 75, 3), band('A', 70, 100, 4)]

    expect(bandFor(overlapping, 72)?.letterGrade).toBe('A')
  })

  it('refuses a score that is not a number', () => {
    expect(bandFor(standard, Number.NaN)).toBeNull()
  })
})

describe('uncoveredScores', () => {
  it('finds nothing wrong with a complete rulebook', () => {
    expect(uncoveredScores(standard)).toEqual([])
  })

  it('reports the exact scores a gap leaves ungradeable', () => {
    const gapped = [band('A', 70, 100, 4), band('F', 0, 67, 0)]

    expect(uncoveredScores(gapped)).toEqual([68, 69])
  })
})
