import { describe, expect, it } from 'vitest'
import { asId } from '../ids'
import type { GradingBand } from './gradingScale'
import {
  attendanceTotals,
  calculateSubjectResult,
  calculateTermGpa,
  describeCalculationProblem,
  type WeightedMark,
} from './calculate'

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

const mark = (overrides: Partial<WeightedMark> = {}): WeightedMark => ({
  weight: 1,
  maxScore: 100,
  score: 80,
  status: 'present',
  ...overrides,
})

describe('calculateSubjectResult', () => {
  describe('weighting', () => {
    it('scores a single assessment as a straight percentage', () => {
      const result = calculateSubjectResult([mark({ score: 80 })], standard)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.cumulativeScore).toBe(80)
      expect(result.value.letterGrade).toBe('A')
      expect(result.value.gpaPoint).toBe(4)
    })

    it('weights assessments by their share of the grade', () => {
      // 40% of 50/100, plus 60% of 90/100 -> 20 + 54 = 74
      const result = calculateSubjectResult(
        [mark({ weight: 0.4, score: 50 }), mark({ weight: 0.6, score: 90 })],
        standard
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.cumulativeScore).toBe(74)
    })

    it('scores against each assessment maximum, not out of 100', () => {
      // 20/25 is 80%, not 20%.
      const result = calculateSubjectResult([mark({ maxScore: 25, score: 20 })], standard)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.cumulativeScore).toBe(80)
    })

    it('rounds to one decimal place', () => {
      const result = calculateSubjectResult([mark({ maxScore: 3, score: 2 })], standard)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.cumulativeScore).toBe(66.7)
    })
  })

  describe('how each status counts', () => {
    it('counts an absence as zero against its full weight', () => {
      // 50% scored full, 50% missed entirely -> 50.
      const result = calculateSubjectResult(
        [mark({ weight: 0.5, score: 100 }), mark({ weight: 0.5, status: 'absent', score: undefined })],
        standard
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.cumulativeScore).toBe(50)
    })

    it('leaves an excused assessment out of the calculation entirely', () => {
      // The remaining assessment carries the whole grade, so 100 stays 100.
      const result = calculateSubjectResult(
        [mark({ weight: 0.5, score: 100 }), mark({ weight: 0.5, status: 'excused', score: undefined })],
        standard
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.cumulativeScore).toBe(100)
    })

    it('treats incomplete the same as excused', () => {
      const result = calculateSubjectResult(
        [mark({ weight: 0.5, score: 60 }), mark({ weight: 0.5, status: 'incomplete', score: undefined })],
        standard
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.cumulativeScore).toBe(60)
    })

    it('distinguishes an absence from an excusal, which is the whole point', () => {
      const absent = calculateSubjectResult(
        [mark({ weight: 0.5, score: 100 }), mark({ weight: 0.5, status: 'absent', score: undefined })],
        standard
      )
      const excused = calculateSubjectResult(
        [mark({ weight: 0.5, score: 100 }), mark({ weight: 0.5, status: 'excused', score: undefined })],
        standard
      )

      expect(absent.ok && absent.value.cumulativeScore).toBe(50)
      expect(excused.ok && excused.value.cumulativeScore).toBe(100)
    })
  })

  describe('refusals', () => {
    it('refuses when every assessment was excused', () => {
      const result = calculateSubjectResult(
        [mark({ status: 'excused', score: undefined })],
        standard
      )

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('nothingToCount')
    })

    it('refuses when there are no marks at all', () => {
      const result = calculateSubjectResult([], standard)

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('nothingToCount')
    })

    it('refuses when the grading scale has a hole where the score lands', () => {
      const gapped = [band('A', 70, 100, 4), band('F', 0, 67, 0)]

      const result = calculateSubjectResult([mark({ score: 68 })], gapped)

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toEqual({ kind: 'noGradingBand', score: 68 })
    })
  })
})

describe('calculateTermGpa', () => {
  it('averages the subject grade points', () => {
    expect(calculateTermGpa([4, 3, 2])).toBe(3)
  })

  it('rounds to two decimal places', () => {
    expect(calculateTermGpa([4, 3])).toBe(3.5)
    expect(calculateTermGpa([4, 3, 3])).toBe(3.33)
  })

  it('reports null when there are no subjects', () => {
    expect(calculateTermGpa([])).toBeNull()
  })

  it('handles a term of straight fails without confusing it for no data', () => {
    expect(calculateTermGpa([0, 0])).toBe(0)
  })
})

describe('attendanceTotals', () => {
  it('counts a late student as present', () => {
    expect(attendanceTotals(['present', 'late'])).toEqual({ present: 2, absent: 0 })
  })

  it('counts an excused absence as an absence', () => {
    expect(attendanceTotals(['present', 'excused'])).toEqual({ present: 1, absent: 1 })
  })

  it('always adds up to the days a register was taken', () => {
    const statuses = ['present', 'late', 'absent', 'excused'] as const
    const totals = attendanceTotals(statuses)

    expect(totals.present + totals.absent).toBe(statuses.length)
  })

  it('reports zeroes for a student with no register entries', () => {
    expect(attendanceTotals([])).toEqual({ present: 0, absent: 0 })
  })
})

describe('describeCalculationProblem', () => {
  it('names the score that fell outside the scale', () => {
    expect(describeCalculationProblem({ kind: 'noGradingBand', score: 68 })).toContain('68')
  })
})
