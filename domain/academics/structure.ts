import { err, ok, type Result } from '../result'
import type {
  ClassSectionId,
  ClassroomId,
  GradeLevelId,
  GradingScaleId,
  PeriodId,
} from '../ids'
import type { AcademicsRepository } from './ports'

export type StructureProblem =
  | { kind: 'nameRequired' }
  | { kind: 'duplicateName'; name: string }
  | { kind: 'gradeNotFound' }
  | { kind: 'invalidCapacity' }
  | { kind: 'invalidTime'; value: string }
  | { kind: 'endBeforeStart' }
  | { kind: 'overlapsPeriod'; existingName: string }
  | { kind: 'letterGradeRequired' }
  | { kind: 'invalidScoreRange' }
  | { kind: 'invalidGpaPoint' }

const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export async function addGradeLevel(
  repo: AcademicsRepository,
  rawName: string
): Promise<Result<GradeLevelId, StructureProblem>> {
  const name = rawName.trim()
  if (name === '') return err({ kind: 'nameRequired' })

  const existing = await repo.listGradeLevels()
  if (existing.some((grade) => grade.name.toLowerCase() === name.toLowerCase())) {
    return err({ kind: 'duplicateName', name })
  }

  return ok(await repo.insertGradeLevel({ name }))
}

export async function addClassSection(
  repo: AcademicsRepository,
  input: { gradeLevelId: GradeLevelId; sectionName: string }
): Promise<Result<ClassSectionId, StructureProblem>> {
  const grades = await repo.listGradeLevels()
  if (!grades.some((grade) => grade.id === input.gradeLevelId)) {
    return err({ kind: 'gradeNotFound' })
  }

  const sectionName = input.sectionName.trim()
  if (sectionName === '') return err({ kind: 'nameRequired' })

  const existing = await repo.listClassSections()
  if (existing.some((section) => section.sectionName.toLowerCase() === sectionName.toLowerCase())) {
    return err({ kind: 'duplicateName', name: sectionName })
  }

  return ok(await repo.insertClassSection({ gradeLevelId: input.gradeLevelId, sectionName }))
}

export async function addClassroom(
  repo: AcademicsRepository,
  input: { name: string; buildingName?: string; capacity?: number }
): Promise<Result<ClassroomId, StructureProblem>> {
  const name = input.name.trim()
  if (name === '') return err({ kind: 'nameRequired' })

  if (
    input.capacity !== undefined &&
    (!Number.isInteger(input.capacity) || input.capacity <= 0)
  ) {
    return err({ kind: 'invalidCapacity' })
  }

  const existing = await repo.listClassrooms()
  if (existing.some((room) => room.name.toLowerCase() === name.toLowerCase())) {
    return err({ kind: 'duplicateName', name })
  }

  const trimmedBuilding = input.buildingName?.trim()
  const buildingName = trimmedBuilding === '' ? undefined : trimmedBuilding

  return ok(
    await repo.insertClassroom({
      name,
      buildingName,
      capacity: input.capacity,
    })
  )
}

export async function addPeriod(
  repo: AcademicsRepository,
  input: { name: string; startTime: string; endTime: string; isBreak: boolean }
): Promise<Result<PeriodId, StructureProblem>> {
  const name = input.name.trim()
  if (name === '') return err({ kind: 'nameRequired' })

  const startTime = input.startTime.trim()
  if (!CLOCK_TIME.test(startTime)) return err({ kind: 'invalidTime', value: input.startTime })

  const endTime = input.endTime.trim()
  if (!CLOCK_TIME.test(endTime)) return err({ kind: 'invalidTime', value: input.endTime })

  if (startTime >= endTime) return err({ kind: 'endBeforeStart' })

  const existing = await repo.listPeriods()
  const overlap = existing.find(
    (period) => startTime < period.endTime && period.startTime < endTime
  )
  if (overlap) return err({ kind: 'overlapsPeriod', existingName: overlap.name })

  return ok(
    await repo.insertPeriod({
      name,
      startTime,
      endTime,
      isBreak: input.isBreak,
    })
  )
}

export async function addGradingBand(
  repo: AcademicsRepository,
  input: {
    name: string
    letterGrade: string
    minScore: number
    maxScore: number
    gpaPoint: number
  }
): Promise<Result<GradingScaleId, StructureProblem>> {
  const name = input.name.trim()
  if (name === '') return err({ kind: 'nameRequired' })

  const letterGrade = input.letterGrade.trim()
  if (letterGrade === '') return err({ kind: 'letterGradeRequired' })

  if (
    !Number.isFinite(input.minScore) ||
    !Number.isFinite(input.maxScore) ||
    input.minScore < 0 ||
    input.maxScore > 100 ||
    input.minScore > input.maxScore
  ) {
    return err({ kind: 'invalidScoreRange' })
  }

  if (!Number.isFinite(input.gpaPoint) || input.gpaPoint < 0) {
    return err({ kind: 'invalidGpaPoint' })
  }

  return ok(
    await repo.insertGradingBand({
      name,
      letterGrade,
      minScore: input.minScore,
      maxScore: input.maxScore,
      gpaPoint: input.gpaPoint,
    })
  )
}

/** Plain-language text, in the voice set by docs/DESIGN.md section 6. */
export function describeStructureProblem(problem: StructureProblem): string {
  switch (problem.kind) {
    case 'nameRequired':
      return 'A name is required.'
    case 'duplicateName':
      return `${problem.name} already exists.`
    case 'gradeNotFound':
      return 'That grade level no longer exists.'
    case 'invalidCapacity':
      return 'Capacity must be a whole number greater than zero.'
    case 'invalidTime':
      return `"${problem.value}" is not a 24-hour time (HH:MM).`
    case 'endBeforeStart':
      return 'A period must end after it starts.'
    case 'overlapsPeriod':
      return `Those times overlap ${problem.existingName}.`
    case 'letterGradeRequired':
      return 'A letter grade is required.'
    case 'invalidScoreRange':
      return 'Scores must fall between 0 and 100, with minimum not exceeding maximum.'
    case 'invalidGpaPoint':
      return 'GPA points must be zero or greater.'
  }
}
