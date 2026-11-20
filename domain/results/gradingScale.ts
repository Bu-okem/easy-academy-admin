import type { GradingScaleId } from '../ids'

/** One band of the school's grading rulebook. Bounds are inclusive. */
export interface GradingBand {
  id: GradingScaleId
  name: string
  letterGrade: string
  minScore: number
  maxScore: number
  gpaPoint: number
}

/**
 * Finds the band a score falls into. Pure - the school changes its grading
 * rules by editing rows, never by editing code, which is the entire reason
 * gradingScales is a table rather than a constant.
 *
 * Where bands overlap, the highest applicable one wins, so a misconfigured
 * rulebook never silently awards a lower grade than the data allows.
 */
export function bandFor(bands: readonly GradingBand[], score: number): GradingBand | null {
  if (!Number.isFinite(score)) return null

  return bands
    .filter((band) => score >= band.minScore && score <= band.maxScore)
    .reduce<GradingBand | null>(
      (best, band) => (best === null || band.minScore > best.minScore ? band : best),
      null
    )
}

/** Gaps in a rulebook, so an admin can be told which scores grade to nothing. */
export function uncoveredScores(
  bands: readonly GradingBand[],
  range: { min: number; max: number } = { min: 0, max: 100 }
): number[] {
  const uncovered: number[] = []
  for (let score = range.min; score <= range.max; score++) {
    if (bandFor(bands, score) === null) uncovered.push(score)
  }
  return uncovered
}
