import { asId } from '../ids'
import type { StudentId, TermId, TermSummaryId } from '../ids'
import type { ResultsRepository, TermSummary } from '../results/ports'

export interface InMemoryResultsRepository extends ResultsRepository {
  rows(): readonly TermSummary[]
  seed(summaries: ReadonlyArray<Omit<TermSummary, 'id'>>): TermSummaryId[]
  /** Stand in for termSubjectResults rows without modelling the whole table. */
  seedSubjectResultCount(where: { studentId: StudentId; termId: TermId }, count: number): void
}

export function inMemoryResultsRepository(): InMemoryResultsRepository {
  const summaries: TermSummary[] = []
  const subjectResultCounts = new Map<string, number>()
  let sequence = 0

  const key = (studentId: StudentId, termId: TermId) => `${studentId}:${termId}`

  return {
    async findSummary(id: TermSummaryId) {
      return summaries.find((s) => s.id === id) ?? null
    },
    async countSubjectResults({ studentId, termId }) {
      return subjectResultCounts.get(key(studentId, termId)) ?? 0
    },
    async setPublished(id, isPublished) {
      const row = summaries.find((s) => s.id === id)
      if (!row) throw new Error(`no term summary ${id}`)
      row.isPublished = isPublished
    },
    rows: () => summaries,
    seed(seeded) {
      return seeded.map((summary) => {
        const id = asId<'termSummaries'>(`summary_${++sequence}`)
        summaries.push({ id, ...summary })
        return id
      })
    },
    seedSubjectResultCount({ studentId, termId }, count) {
      subjectResultCounts.set(key(studentId, termId), count)
    },
  }
}
