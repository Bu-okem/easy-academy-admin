import { err, ok, type Result } from '../result'
import type { AttendanceStatus } from '../attendance/ports'
import type { MarkStatus } from '../marks/ports'
import { bandFor, type GradingBand } from './gradingScale'

/** One assessment and what the student got for it. */
export interface WeightedMark {
  /** Share of the subject's final grade, e.g. 0.4 for 40%. */
  weight: number
  maxScore: number
  score?: number
  status: MarkStatus
}

export interface SubjectCalculation {
  /** Weighted percentage, 0-100, to one decimal place. */
  cumulativeScore: number
  letterGrade: string
  gpaPoint: number
}

export type CalculationProblem =
  | { kind: 'nothingToCount' }
  | { kind: 'noGradingBand'; score: number }

/**
 * A student's result for one subject in one term.
 *
 * How each status counts is the decision that matters, and it is not obvious:
 *
 * - **present** contributes its score against its weight.
 * - **absent** contributes zero against its full weight. The student was
 *   expected and did not sit it; excusing it silently would inflate the grade.
 * - **excused** and **incomplete** are left out of both the score and the
 *   weight. The student is neither credited nor penalised, and the remaining
 *   assessments simply carry more of the grade between them.
 *
 * That last rule is why the denominator is the weight of what actually counted,
 * not the total weight of the syllabus.
 */
export function calculateSubjectResult(
  marks: readonly WeightedMark[],
  bands: readonly GradingBand[]
): Result<SubjectCalculation, CalculationProblem> {
  const counted = marks.filter(
    (mark) => mark.status === 'present' || mark.status === 'absent'
  )
  const totalWeight = counted.reduce((sum, mark) => sum + mark.weight, 0)

  if (counted.length === 0 || totalWeight <= 0) return err({ kind: 'nothingToCount' })

  const earned = counted.reduce((sum, mark) => {
    if (mark.status === 'absent' || mark.score === undefined) return sum
    if (mark.maxScore <= 0) return sum
    return sum + (mark.score / mark.maxScore) * mark.weight
  }, 0)

  const cumulativeScore = round((earned / totalWeight) * 100, 1)
  const band = bandFor(bands, cumulativeScore)
  if (!band) return err({ kind: 'noGradingBand', score: cumulativeScore })

  return ok({
    cumulativeScore,
    letterGrade: band.letterGrade,
    gpaPoint: band.gpaPoint,
  })
}

/**
 * The term's GPA: the mean of the subject grade points.
 *
 * Unweighted by design — a school that weights subjects by credit would pass
 * those weights in, and this is the one place that would change.
 */
export function calculateTermGpa(gpaPoints: readonly number[]): number | null {
  if (gpaPoints.length === 0) return null
  const total = gpaPoints.reduce((sum, point) => sum + point, 0)
  return round(total / gpaPoints.length, 2)
}

/**
 * Days present and absent for the report card header.
 *
 * Matches the rule the Overview already uses: a late student was there, and an
 * excused absence is still an absence. Both figures come from the same register,
 * so they always add up to the days a register was taken.
 */
export function attendanceTotals(statuses: readonly AttendanceStatus[]): {
  present: number
  absent: number
} {
  const present = statuses.filter((s) => s === 'present' || s === 'late').length
  return { present, absent: statuses.length - present }
}

/** Plain-language text, in the voice set by docs/DESIGN.md section 6. */
export function describeCalculationProblem(problem: CalculationProblem): string {
  switch (problem.kind) {
    case 'nothingToCount':
      return 'No marks have been entered that count towards this subject.'
    case 'noGradingBand':
      return `${problem.score}% falls outside every band in the grading scale.`
  }
}

function round(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}
