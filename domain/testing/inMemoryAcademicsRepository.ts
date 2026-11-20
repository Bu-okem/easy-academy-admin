import { asId } from '../ids'
import type { AcademicYearId } from '../ids'
import type {
  AcademicsRepository,
  AcademicYear,
  ClassSection,
  Classroom,
  GradeLevel,
  GradingScaleBand,
  Period,
  Subject,
  Term,
} from '../academics/ports'

export interface InMemoryAcademicsRepository extends AcademicsRepository {
  years(): readonly AcademicYear[]
  terms(): readonly Term[]
  subjects(): readonly Subject[]
  seedYears(years: ReadonlyArray<Omit<AcademicYear, 'id'>>): AcademicYearId[]
  seedTerms(terms: ReadonlyArray<Omit<Term, 'id'>>): void
  seedSubjects(subjects: ReadonlyArray<Omit<Subject, 'id'>>): void
}

export function inMemoryAcademicsRepository(): InMemoryAcademicsRepository {
  const years: AcademicYear[] = []
  const terms: Term[] = []
  const subjects: Subject[] = []
  const gradeLevels: GradeLevel[] = []
  const classSections: ClassSection[] = []
  const classrooms: Classroom[] = []
  const periods: Period[] = []
  const gradingBands: GradingScaleBand[] = []
  let sequence = 0
  const next = () => ++sequence

  return {
    async listYears() {
      return [...years]
    },
    async insertYear(year) {
      const id = asId<'academicYears'>(`year_${next()}`)
      years.push({ id, ...year })
      return id
    },
    async setYearActive(id, isActive) {
      const year = years.find((y) => y.id === id)
      if (!year) throw new Error(`no year ${id}`)
      year.isActive = isActive
    },
    async listTerms(academicYearId) {
      return terms.filter((term) => term.academicYearId === academicYearId)
    },
    async insertTerm(term) {
      const id = asId<'terms'>(`term_${next()}`)
      terms.push({ id, ...term })
      return id
    },
    async findSubjectByCode(code) {
      return subjects.find((subject) => subject.code === code) ?? null
    },
    async insertSubject(subject) {
      const id = asId<'subjects'>(`subject_${next()}`)
      subjects.push({ id, ...subject })
      return id
    },
    async listGradeLevels() {
      return [...gradeLevels]
    },
    async insertGradeLevel(grade) {
      const id = asId<'gradeLevels'>(`grade_${next()}`)
      gradeLevels.push({ id, ...grade })
      return id
    },
    async listClassSections() {
      return [...classSections]
    },
    async insertClassSection(section) {
      const id = asId<'classSections'>(`section_${next()}`)
      classSections.push({ id, ...section })
      return id
    },
    async listClassrooms() {
      return [...classrooms]
    },
    async insertClassroom(room) {
      const id = asId<'classrooms'>(`room_${next()}`)
      classrooms.push({ id, ...room })
      return id
    },
    async listPeriods() {
      return [...periods]
    },
    async insertPeriod(period) {
      const id = asId<'periods'>(`period_${next()}`)
      periods.push({ id, ...period })
      return id
    },
    async listGradingBands() {
      return [...gradingBands]
    },
    async insertGradingBand(band) {
      const id = asId<'gradingScales'>(`band_${next()}`)
      gradingBands.push({ id, ...band })
      return id
    },
    years: () => years,
    terms: () => terms,
    subjects: () => subjects,
    seedYears(seeded) {
      return seeded.map((year) => {
        const id = asId<'academicYears'>(`year_${next()}`)
        years.push({ id, ...year })
        return id
      })
    },
    seedTerms(seeded) {
      for (const term of seeded) terms.push({ id: asId<'terms'>(`term_${next()}`), ...term })
    },
    seedSubjects(seeded) {
      for (const subject of seeded) {
        subjects.push({ id: asId<'subjects'>(`subject_${next()}`), ...subject })
      }
    },
  }
}
