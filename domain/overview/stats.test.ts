import { describe, expect, it } from 'vitest'
import type { AttendanceStatus } from '../attendance/ports'
import { attendanceRate, change, weekOfTerm } from './stats'

const register = (...statuses: AttendanceStatus[]) => statuses

describe('attendanceRate', () => {
  it('counts a full register as 100%', () => {
    expect(attendanceRate(register('present', 'present', 'present'))).toBe(100)
  })

  it('counts a late student as attended', () => {
    expect(attendanceRate(register('present', 'late'))).toBe(100)
  })

  it('counts an excused absence as not attended', () => {
    expect(attendanceRate(register('present', 'excused'))).toBe(50)
  })

  it('counts an unexcused absence as not attended', () => {
    expect(attendanceRate(register('present', 'absent'))).toBe(50)
  })

  it('rounds to one decimal place', () => {
    expect(attendanceRate(register('present', 'present', 'absent'))).toBe(66.7)
  })

  it('reports 0 when a register was taken and nobody came', () => {
    expect(attendanceRate(register('absent', 'absent'))).toBe(0)
  })

  it('reports null when no register was taken at all', () => {
    expect(attendanceRate([])).toBeNull()
  })
})

describe('change', () => {
  it('reports a rise', () => {
    expect(change(1278, 1260)).toBe(18)
  })

  it('reports a fall', () => {
    expect(change(94.2, 95.3)).toBe(-1.1)
  })

  it('reports no movement as zero', () => {
    expect(change(84, 84)).toBe(0)
  })

  it('reports null when there is nothing to compare against', () => {
    expect(change(1278, null)).toBeNull()
    expect(change(1278, undefined)).toBeNull()
  })
})

describe('weekOfTerm', () => {
  const start = '2026-09-07'
  const end = '2026-12-11'

  it('counts the first day as week 1', () => {
    expect(weekOfTerm(start, end, '2026-09-07')).toBe(1)
  })

  it('keeps the whole first seven days in week 1', () => {
    expect(weekOfTerm(start, end, '2026-09-13')).toBe(1)
  })

  it('rolls over on the eighth day', () => {
    expect(weekOfTerm(start, end, '2026-09-14')).toBe(2)
  })

  it('counts a date later in the term', () => {
    expect(weekOfTerm(start, end, '2026-09-22')).toBe(3)
  })

  it('counts the last day of term', () => {
    expect(weekOfTerm(start, end, end)).toBe(14)
  })

  it('reports null before the term starts', () => {
    expect(weekOfTerm(start, end, '2026-09-06')).toBeNull()
  })

  it('reports null after the term ends', () => {
    expect(weekOfTerm(start, end, '2026-12-12')).toBeNull()
  })
})
