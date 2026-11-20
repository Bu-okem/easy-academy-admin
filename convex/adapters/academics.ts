import type { DatabaseReader, DatabaseWriter } from '../_generated/server'
import { asId } from '../../domain/ids'
import { toConvexId } from './ids'
import type { AcademicsRepository } from '../../domain/academics/ports'

/** Convex-backed implementation of the academics port. */
export function convexAcademicsRepository(
  db: DatabaseReader & DatabaseWriter
): AcademicsRepository {
  return {
    async listYears() {
      const rows = await db.query('academicYears').collect()
      return rows.map((row) => ({
        id: asId(row._id),
        name: row.name,
        isActive: row.isActive,
      }))
    },

    async insertYear(year) {
      const id = await db.insert('academicYears', { name: year.name, isActive: year.isActive })
      return asId(id)
    },

    async setYearActive(id, isActive) {
      await db.patch(toConvexId<'academicYears'>(id), { isActive })
    },

    async listTerms(academicYearId) {
      const rows = await db
        .query('terms')
        .withIndex('by_academic_year', (q) =>
          q.eq('academicYearId', toConvexId<'academicYears'>(academicYearId))
        )
        .collect()

      return rows.map((row) => ({
        id: asId(row._id),
        academicYearId: asId(row.academicYearId),
        name: row.name,
        startDate: row.startDate,
        endDate: row.endDate,
      }))
    },

    async insertTerm(term) {
      const id = await db.insert('terms', {
        academicYearId: toConvexId<'academicYears'>(term.academicYearId),
        name: term.name,
        startDate: term.startDate,
        endDate: term.endDate,
      })
      return asId(id)
    },

    async findSubjectByCode(code) {
      // by_code exists for exactly this check; it makes the lookup cheap, it
      // does not make the code unique.
      const row = await db
        .query('subjects')
        .withIndex('by_code', (q) => q.eq('code', code))
        .first()

      return row ? { id: asId(row._id), name: row.name, code: row.code } : null
    },

    async insertSubject(subject) {
      const id = await db.insert('subjects', { name: subject.name, code: subject.code })
      return asId(id)
    },

    async listGradeLevels() {
      const rows = await db.query('gradeLevels').collect()
      return rows.map((row) => ({ id: asId(row._id), name: row.name }))
    },

    async insertGradeLevel(grade) {
      const id = await db.insert('gradeLevels', { name: grade.name })
      return asId(id)
    },

    async listClassSections() {
      const rows = await db.query('classSections').collect()
      return rows.map((row) => ({
        id: asId(row._id),
        gradeLevelId: asId(row.gradeLevelId),
        sectionName: row.sectionName,
      }))
    },

    async insertClassSection(section) {
      const id = await db.insert('classSections', {
        gradeLevelId: toConvexId<'gradeLevels'>(section.gradeLevelId),
        sectionName: section.sectionName,
      })
      return asId(id)
    },

    async listClassrooms() {
      const rows = await db.query('classrooms').collect()
      return rows.map((row) => ({
        id: asId(row._id),
        name: row.name,
        capacity: row.capacity,
        buildingName: row.buildingName,
      }))
    },

    async insertClassroom(room) {
      const id = await db.insert('classrooms', {
        name: room.name,
        capacity: room.capacity,
        buildingName: room.buildingName,
      })
      return asId(id)
    },

    async listPeriods() {
      const rows = await db.query('periods').collect()
      return rows.map((row) => ({
        id: asId(row._id),
        name: row.name,
        startTime: row.startTime,
        endTime: row.endTime,
        isBreak: row.isBreak,
      }))
    },

    async insertPeriod(period) {
      const id = await db.insert('periods', {
        name: period.name,
        startTime: period.startTime,
        endTime: period.endTime,
        isBreak: period.isBreak,
      })
      return asId(id)
    },

    async listGradingBands() {
      const rows = await db.query('gradingScales').collect()
      return rows.map((row) => ({
        id: asId(row._id),
        name: row.name,
        letterGrade: row.letterGrade,
        minScore: row.minScore,
        maxScore: row.maxScore,
        gpaPoint: row.gpaPoint,
      }))
    },

    async insertGradingBand(band) {
      const id = await db.insert('gradingScales', {
        name: band.name,
        letterGrade: band.letterGrade,
        minScore: band.minScore,
        maxScore: band.maxScore,
        gpaPoint: band.gpaPoint,
      })
      return asId(id)
    },
  }
}
