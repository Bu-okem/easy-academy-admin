import { attendanceRate } from './stats'
import type { AttendanceStatus } from '../attendance/ports'

export interface DayRegister {
  /** "YYYY-MM-DD" */
  date: string
  statuses: readonly AttendanceStatus[]
}

export interface TrendPoint {
  date: string
  /** Percentage attended, 0-100. */
  rate: number
}

/**
 * The attendance trend, one point per day a register was actually taken.
 *
 * Days with no register are dropped rather than plotted as zero. A zero would
 * read as "nobody came", which is a very different statement from "nobody took
 * the register", and a chart that confuses the two is worse than no chart.
 *
 * Points come back in date order, which for "YYYY-MM-DD" is plain string order.
 */
export function attendanceTrend(days: readonly DayRegister[]): TrendPoint[] {
  return days
    .map((day) => ({ date: day.date, rate: attendanceRate(day.statuses) }))
    .filter((point): point is TrendPoint => point.rate !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Short axis label for a "YYYY-MM-DD" date: "7 Sep". */
export function trendLabel(date: string): string {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [, month, day] = date.split('-')
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? ''}`.trim()
}
