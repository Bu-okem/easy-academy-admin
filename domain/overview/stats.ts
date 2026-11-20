import type { AttendanceStatus } from '../attendance/ports'

/**
 * Share of a register that actually turned up, as a percentage.
 *
 * A late student was present, so `late` counts as attended. `excused` does not:
 * the absence is authorised, but the student was still not there, and a rate
 * that hid authorised absence would overstate how full the school was. If the
 * school's own definition differs, this is the one place to change it.
 *
 * Returns null when no register was taken - distinct from 0%, which means a
 * register was taken and nobody came.
 */
export function attendanceRate(statuses: readonly AttendanceStatus[]): number | null {
  if (statuses.length === 0) return null

  const attended = statuses.filter((s) => s === 'present' || s === 'late').length
  return round(attended / statuses.length * 100, 1)
}

/**
 * Change from one figure to another, for a KPI delta badge.
 * Returns null when there is nothing to compare against, so the UI can omit the
 * badge rather than invent a baseline of zero and claim an infinite rise.
 */
export function change(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined) return null
  return round(current - previous, 1)
}

function round(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

/**
 * Which week of a term a date falls in, counting the first week as week 1.
 *
 * Dates are "YYYY-MM-DD" and compared as whole days, so a term that starts on a
 * Monday puts that Monday and the following Sunday in the same week. Returns
 * null for a date outside the term, which is not a week of it.
 */
export function weekOfTerm(termStart: string, termEnd: string, date: string): number | null {
  if (date < termStart || date > termEnd) return null

  const days = Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${termStart}T00:00:00Z`)) / 86_400_000)
  return Math.floor(days / 7) + 1
}
