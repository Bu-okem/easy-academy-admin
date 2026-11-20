/**
 * The schema stores dates as "YYYY-MM-DD" strings. Lexicographic comparison is
 * therefore chronological comparison, which is why these helpers use plain
 * string operators and never construct a Date - no timezone can shift a school
 * day into the one before it.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function isWithin(date: string, start: string, end: string): boolean {
  return date >= start && date <= end
}
