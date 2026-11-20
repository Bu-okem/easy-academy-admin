import { describe, expect, it } from 'vitest'
import { formatDayMonthYear } from './dates'

describe('formatDayMonthYear', () => {
  it('formats a date without a leading zero on the day', () => {
    expect(formatDayMonthYear('2009-03-12')).toBe('12 Mar 2009')
    expect(formatDayMonthYear('2009-07-04')).toBe('4 Jul 2009')
  })

  it('uses three letters for every month, September included', () => {
    expect(formatDayMonthYear('2009-09-21')).toBe('21 Sep 2009')
  })

  it('covers the first and last month', () => {
    expect(formatDayMonthYear('2008-01-19')).toBe('19 Jan 2008')
    expect(formatDayMonthYear('2008-12-30')).toBe('30 Dec 2008')
  })

  it('does not shift the day across a timezone boundary', () => {
    // Parsed as a Date in a negative-offset zone this would render as the 31st.
    expect(formatDayMonthYear('2009-01-01')).toBe('1 Jan 2009')
  })

  it('rejects a format it does not understand', () => {
    expect(formatDayMonthYear('12/03/2009')).toBeNull()
    expect(formatDayMonthYear('2009-3-12')).toBeNull()
    expect(formatDayMonthYear('')).toBeNull()
  })

  it('rejects an impossible month or day', () => {
    expect(formatDayMonthYear('2009-13-01')).toBeNull()
    expect(formatDayMonthYear('2009-01-00')).toBeNull()
  })
})
