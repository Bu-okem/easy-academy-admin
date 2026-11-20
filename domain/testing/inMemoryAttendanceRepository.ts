import { asId } from '../ids'
import type {
  AttendanceRecord,
  AttendanceRepository,
  TermDates,
} from '../attendance/ports'
import type { TermId } from '../ids'

export interface InMemoryAttendanceRepository extends AttendanceRepository {
  rows(): readonly AttendanceRecord[]
  seedTerm(term: TermDates): void
  seed(records: ReadonlyArray<Omit<AttendanceRecord, 'id'>>): void
}

export function inMemoryAttendanceRepository(): InMemoryAttendanceRepository {
  const records: AttendanceRecord[] = []
  const terms = new Map<string, TermDates>()
  let sequence = 0

  const add = (record: Omit<AttendanceRecord, 'id'>) => {
    const id = asId<'attendanceRecords'>(`attendance_${++sequence}`)
    records.push({ id, ...record })
    return id
  }

  return {
    async findTerm(termId: TermId) {
      return terms.get(termId) ?? null
    },
    async findForStudentOnDate({ studentId, classSectionId, attendanceDate }) {
      return (
        records.find(
          (r) =>
            r.studentId === studentId &&
            r.classSectionId === classSectionId &&
            r.attendanceDate === attendanceDate
        ) ?? null
      )
    },
    async insert(record) {
      return add(record)
    },
    async amend(id, patch) {
      const row = records.find((r) => r.id === id)
      if (!row) throw new Error(`no attendance record ${id}`)
      row.status = patch.status
      row.remarks = patch.remarks
    },
    rows: () => records,
    seedTerm(term) {
      terms.set(term.id, term)
    },
    seed(seeded) {
      seeded.forEach(add)
    },
  }
}
