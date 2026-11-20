import type {
  AcademicYearId,
  ClassSectionId,
  ClassroomId,
  GradeLevelId,
  GradingScaleId,
  PeriodId,
  SubjectId,
  TermId,
} from '../ids'

export interface AcademicYear {
  id: AcademicYearId
  name: string
  isActive: boolean
}

export interface Term {
  id: TermId
  academicYearId: AcademicYearId
  name: string
  startDate: string
  endDate: string
}

export interface Subject {
  id: SubjectId
  name: string
  code: string
}

export interface GradeLevel {
  id: GradeLevelId
  name: string
}

export interface ClassSection {
  id: ClassSectionId
  gradeLevelId: GradeLevelId
  sectionName: string
}

export interface Classroom {
  id: ClassroomId
  name: string
  capacity?: number
  buildingName?: string
}

export interface Period {
  id: PeriodId
  name: string
  startTime: string
  endTime: string
  isBreak: boolean
}

export interface GradingScaleBand {
  id: GradingScaleId
  name: string
  letterGrade: string
  minScore: number
  maxScore: number
  gpaPoint: number
}

export interface AcademicsRepository {
  listYears(): Promise<AcademicYear[]>
  insertYear(year: Omit<AcademicYear, 'id'>): Promise<AcademicYearId>
  setYearActive(id: AcademicYearId, isActive: boolean): Promise<void>

  listTerms(academicYearId: AcademicYearId): Promise<Term[]>
  insertTerm(term: Omit<Term, 'id'>): Promise<TermId>

  /** Looked up by the normalised code, which is what uniqueness is judged on. */
  findSubjectByCode(code: string): Promise<Subject | null>
  insertSubject(subject: Omit<Subject, 'id'>): Promise<SubjectId>

  listGradeLevels(): Promise<GradeLevel[]>
  insertGradeLevel(grade: Omit<GradeLevel, 'id'>): Promise<GradeLevelId>

  listClassSections(): Promise<ClassSection[]>
  insertClassSection(section: Omit<ClassSection, 'id'>): Promise<ClassSectionId>

  listClassrooms(): Promise<Classroom[]>
  insertClassroom(room: Omit<Classroom, 'id'>): Promise<ClassroomId>

  listPeriods(): Promise<Period[]>
  insertPeriod(period: Omit<Period, 'id'>): Promise<PeriodId>

  listGradingBands(): Promise<GradingScaleBand[]>
  insertGradingBand(band: Omit<GradingScaleBand, 'id'>): Promise<GradingScaleId>
}
