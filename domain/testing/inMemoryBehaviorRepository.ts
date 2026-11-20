import { asId } from '../ids'
import type { TermId } from '../ids'
import type { BehaviorRecord, BehaviorRepository } from '../behavior/ports'

export interface InMemoryBehaviorRepository extends BehaviorRepository {
  rows(): readonly BehaviorRecord[]
  seedTerm(term: { id: TermId; startDate: string; endDate: string }): void
}

export function inMemoryBehaviorRepository(): InMemoryBehaviorRepository {
  const records: BehaviorRecord[] = []
  const terms = new Map<string, { id: TermId; startDate: string; endDate: string }>()
  let sequence = 0

  return {
    async findTerm(termId: TermId) {
      return terms.get(termId) ?? null
    },
    async insert(record) {
      const id = asId<'behaviorRecords'>(`behavior_${++sequence}`)
      records.push({ id, ...record })
      return id
    },
    rows: () => records,
    seedTerm(term) {
      terms.set(term.id, term)
    },
  }
}
