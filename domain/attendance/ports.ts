import type {
  AttendanceRecordId,
  ClassSectionId,
  StudentId,
  TeacherId,
  TermId,
} from '../ids'

/** Mirrors the schema's vocabulary exactly (docs/DESIGN.md section 6). */
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'

export interface AttendanceRecord {
  id: AttendanceRecordId
  studentId: StudentId
  classSectionId: ClassSectionId
  teacherId: TeacherId
  termId: TermId
  attendanceDate: string // "YYYY-MM-DD"
  status: AttendanceStatus
  remarks?: string
}

/** Only the fields the attendance rules actually need from a term. */
export interface TermDates {
  id: TermId
  startDate: string
  endDate: string
}

export interface AttendanceRepository {
  findTerm(termId: TermId): Promise<TermDates | null>

  /** The student's existing register entry for this day, if one was taken. */
  findForStudentOnDate(where: {
    studentId: StudentId
    classSectionId: ClassSectionId
    attendanceDate: string
  }): Promise<AttendanceRecord | null>

  insert(record: Omit<AttendanceRecord, 'id'>): Promise<AttendanceRecordId>

  amend(
    id: AttendanceRecordId,
    patch: { status: AttendanceStatus; remarks?: string }
  ): Promise<void>
}
