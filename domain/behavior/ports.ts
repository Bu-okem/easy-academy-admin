import type { BehaviorRecordId, StudentId, TeacherId, TermId } from '../ids'

/** Mirrors the schema's vocabulary exactly (docs/DESIGN.md section 6). */
export type BehaviorType = 'merit' | 'demerit'

export interface BehaviorRecord {
  id: BehaviorRecordId
  studentId: StudentId
  teacherId: TeacherId
  termId: TermId
  type: BehaviorType
  severityLevel: number
  description: string
  incidentDate: string
  actionTaken?: string
}

export interface BehaviorRepository {
  findTerm(termId: TermId): Promise<{ id: TermId; startDate: string; endDate: string } | null>
  insert(record: Omit<BehaviorRecord, 'id'>): Promise<BehaviorRecordId>
}
