import { err, ok, type Result } from '../result'
import type { Period } from './ports'

const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export interface BreakRule {
  afterLesson: number
  name: string
  durationMinutes: number
}

export interface TimedBreakRule {
  name: string
  startTime: string
  durationMinutes: number
}

export interface GenerateScheduleInput {
  startTime: string
  lessonCount: number
  lessonDurationMinutes: number
  passingMinutes?: number
  breaks: BreakRule[]
}

export interface GenerateTimedScheduleInput {
  startTime: string
  lessonCount: number
  lessonDurationMinutes: number
  passingMinutes?: number
  breaks: TimedBreakRule[]
}

export interface GeneratedPeriod {
  name: string
  startTime: string
  endTime: string
  isBreak: boolean
}

export type ScheduleProblem =
  | { kind: 'invalidTime'; value: string }
  | { kind: 'invalidLessonCount' }
  | { kind: 'invalidLessonDuration' }
  | { kind: 'invalidPassingDuration' }
  | { kind: 'invalidBreak'; message: string }
  | { kind: 'dayOverflow' }
  | { kind: 'nameRequired' }
  | { kind: 'endBeforeStart' }
  | { kind: 'overlapsPeriod'; existingName: string }

function toMinutes(clock: string): number {
  const [hoursStr = '0', minutesStr = '0'] = clock.split(':')
  return Number(hoursStr) * 60 + Number(minutesStr)
}

function toClock(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/**
 * Generates a non-overlapping sequence of teaching periods and breaks from
 * a start time, lesson duration, optional passing gap, and break rules.
 */
export function generateBellSchedule(
  input: GenerateScheduleInput
): Result<GeneratedPeriod[], ScheduleProblem> {
  const startTime = input.startTime.trim()
  if (!CLOCK_TIME.test(startTime)) {
    return err({ kind: 'invalidTime', value: input.startTime })
  }

  if (!Number.isInteger(input.lessonCount) || input.lessonCount < 1 || input.lessonCount > 12) {
    return err({ kind: 'invalidLessonCount' })
  }

  if (
    !Number.isInteger(input.lessonDurationMinutes) ||
    input.lessonDurationMinutes < 15 ||
    input.lessonDurationMinutes > 180
  ) {
    return err({ kind: 'invalidLessonDuration' })
  }

  const passingMinutes = input.passingMinutes ?? 0
  if (!Number.isInteger(passingMinutes) || passingMinutes < 0 || passingMinutes > 30) {
    return err({ kind: 'invalidPassingDuration' })
  }

  const breakMap = new Map<number, { name: string; durationMinutes: number }>()
  for (const rule of input.breaks) {
    const name = rule.name.trim()
    if (name === '') {
      return err({ kind: 'invalidBreak', message: 'Every break needs a name.' })
    }
    if (
      !Number.isInteger(rule.afterLesson) ||
      rule.afterLesson < 1 ||
      rule.afterLesson >= input.lessonCount
    ) {
      return err({
        kind: 'invalidBreak',
        message: `Break "${name}" must sit after a lesson between 1 and ${input.lessonCount - 1}.`,
      })
    }
    if (
      !Number.isInteger(rule.durationMinutes) ||
      rule.durationMinutes < 5 ||
      rule.durationMinutes > 120
    ) {
      return err({
        kind: 'invalidBreak',
        message: `Break "${name}" duration must be between 5 and 120 minutes.`,
      })
    }
    if (breakMap.has(rule.afterLesson)) {
      return err({
        kind: 'invalidBreak',
        message: `Only one break can be placed directly after Period ${rule.afterLesson}.`,
      })
    }
    breakMap.set(rule.afterLesson, { name, durationMinutes: rule.durationMinutes })
  }

  const periods: GeneratedPeriod[] = []
  let cursor = toMinutes(startTime)

  for (let lesson = 1; lesson <= input.lessonCount; lesson++) {
    const lessonEnd = cursor + input.lessonDurationMinutes
    if (lessonEnd >= 24 * 60) {
      return err({ kind: 'dayOverflow' })
    }
    periods.push({
      name: `Period ${lesson}`,
      startTime: toClock(cursor),
      endTime: toClock(lessonEnd),
      isBreak: false,
    })
    cursor = lessonEnd

    const breakRule = breakMap.get(lesson)
    if (breakRule) {
      const breakEnd = cursor + breakRule.durationMinutes
      if (breakEnd >= 24 * 60) {
        return err({ kind: 'dayOverflow' })
      }
      periods.push({
        name: breakRule.name,
        startTime: toClock(cursor),
        endTime: toClock(breakEnd),
        isBreak: true,
      })
      cursor = breakEnd
    } else if (lesson < input.lessonCount) {
      cursor += passingMinutes
    }
  }

  return ok(periods)
}

/**
 * Generates a bell schedule where breaks are placed by explicit start time
 * and duration rather than after a specific lesson index.
 */
export function generateBellScheduleByBreakTimes(
  input: GenerateTimedScheduleInput
): Result<GeneratedPeriod[], ScheduleProblem> {
  const startTime = input.startTime.trim()
  if (!CLOCK_TIME.test(startTime)) {
    return err({ kind: 'invalidTime', value: input.startTime })
  }

  if (!Number.isInteger(input.lessonCount) || input.lessonCount < 1 || input.lessonCount > 12) {
    return err({ kind: 'invalidLessonCount' })
  }

  if (
    !Number.isInteger(input.lessonDurationMinutes) ||
    input.lessonDurationMinutes < 15 ||
    input.lessonDurationMinutes > 180
  ) {
    return err({ kind: 'invalidLessonDuration' })
  }

  const passingMinutes = input.passingMinutes ?? 0
  if (!Number.isInteger(passingMinutes) || passingMinutes < 0 || passingMinutes > 30) {
    return err({ kind: 'invalidPassingDuration' })
  }

  const dayStart = toMinutes(startTime)
  const parsedBreaks: Array<{ name: string; start: number; end: number }> = []

  for (const rule of input.breaks) {
    const name = rule.name.trim()
    if (name === '') {
      return err({ kind: 'invalidBreak', message: 'Every break needs a name.' })
    }
    const breakTime = rule.startTime.trim()
    if (!CLOCK_TIME.test(breakTime)) {
      return err({ kind: 'invalidTime', value: rule.startTime })
    }
    if (
      !Number.isInteger(rule.durationMinutes) ||
      rule.durationMinutes < 5 ||
      rule.durationMinutes > 120
    ) {
      return err({
        kind: 'invalidBreak',
        message: `Break "${name}" duration must be between 5 and 120 minutes.`,
      })
    }
    const start = toMinutes(breakTime)
    const end = start + rule.durationMinutes
    if (start < dayStart) {
      return err({
        kind: 'invalidBreak',
        message: `Break "${name}" cannot start before the school day (${startTime}).`,
      })
    }
    if (end >= 24 * 60) {
      return err({ kind: 'dayOverflow' })
    }
    parsedBreaks.push({ name, start, end })
  }

  parsedBreaks.sort((a, b) => a.start - b.start)
  for (let i = 1; i < parsedBreaks.length; i++) {
    const prev = parsedBreaks[i - 1]!
    const curr = parsedBreaks[i]!
    if (curr.start < prev.end) {
      return err({
        kind: 'invalidBreak',
        message: `Break "${curr.name}" overlaps "${prev.name}".`,
      })
    }
  }

  const periods: GeneratedPeriod[] = []
  let cursor = dayStart
  let breakIndex = 0

  for (let lesson = 1; lesson <= input.lessonCount; lesson++) {
    while (breakIndex < parsedBreaks.length) {
      const nextBreak = parsedBreaks[breakIndex]!
      if (cursor + input.lessonDurationMinutes <= nextBreak.start) {
        break
      }
      periods.push({
        name: nextBreak.name,
        startTime: toClock(nextBreak.start),
        endTime: toClock(nextBreak.end),
        isBreak: true,
      })
      cursor = Math.max(cursor, nextBreak.end)
      breakIndex++
    }

    const lessonEnd = cursor + input.lessonDurationMinutes
    if (lessonEnd >= 24 * 60) {
      return err({ kind: 'dayOverflow' })
    }
    periods.push({
      name: `Period ${lesson}`,
      startTime: toClock(cursor),
      endTime: toClock(lessonEnd),
      isBreak: false,
    })
    cursor = lessonEnd

    if (lesson < input.lessonCount) {
      cursor += passingMinutes
    }
  }

  return ok(periods)
}

/** Validates an edit to an existing period against all other periods. */
export function validatePeriodUpdate(
  existingPeriods: readonly Period[],
  targetId: string,
  input: { name: string; startTime: string; endTime: string; isBreak: boolean }
): Result<{ name: string; startTime: string; endTime: string; isBreak: boolean }, ScheduleProblem> {
  const name = input.name.trim()
  if (name === '') return err({ kind: 'nameRequired' })

  const startTime = input.startTime.trim()
  if (!CLOCK_TIME.test(startTime)) return err({ kind: 'invalidTime', value: input.startTime })

  const endTime = input.endTime.trim()
  if (!CLOCK_TIME.test(endTime)) return err({ kind: 'invalidTime', value: input.endTime })

  if (startTime >= endTime) return err({ kind: 'endBeforeStart' })

  const overlap = existingPeriods.find(
    (period) => period.id !== targetId && startTime < period.endTime && period.startTime < endTime
  )
  if (overlap) return err({ kind: 'overlapsPeriod', existingName: overlap.name })

  return ok({ name, startTime, endTime, isBreak: input.isBreak })
}

export function describeScheduleProblem(problem: ScheduleProblem): string {
  switch (problem.kind) {
    case 'invalidTime':
      return `"${problem.value}" is not a 24-hour time (HH:MM).`
    case 'invalidLessonCount':
      return 'Number of lessons must be between 1 and 12.'
    case 'invalidLessonDuration':
      return 'Lesson duration must be between 15 and 180 minutes.'
    case 'invalidPassingDuration':
      return 'Passing time between lessons must be between 0 and 30 minutes.'
    case 'invalidBreak':
      return problem.message
    case 'dayOverflow':
      return 'The schedule extends past midnight. Reduce lesson count or durations.'
    case 'nameRequired':
      return 'A period name is required.'
    case 'endBeforeStart':
      return 'A period must end after it starts.'
    case 'overlapsPeriod':
      return `Those times overlap ${problem.existingName}.`
  }
}
