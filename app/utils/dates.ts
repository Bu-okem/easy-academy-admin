/**
 * Date formatting for display. The schema stores dates as "YYYY-MM-DD".
 *
 * A fixed month list rather than toLocaleDateString: ICU renders en-GB September
 * as "Sept" and every other month with three letters, which reads unevenly in a
 * table column, and the output varies with the ICU data a given Node build ships.
 */
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/** "2009-03-12" -> "12 Mar 2009". Returns null for anything unparseable. */
export function formatDayMonthYear(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  // Split into parts rather than parsed as a Date, so no timezone can shift the day.
  return `${day} ${MONTHS[month - 1]} ${year}`
}
