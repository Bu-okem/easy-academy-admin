import { describe, expect, it } from 'vitest'
import { asId } from '../ids'
import {
  generateBellSchedule,
  generateBellScheduleByBreakTimes,
  validatePeriodUpdate,
} from './schedule'

describe('generateBellSchedule', () => {
  it('builds periods with breaks and passing time', () => {
    const result = generateBellSchedule({
      startTime: '08:00',
      lessonCount: 4,
      lessonDurationMinutes: 40,
      passingMinutes: 5,
      breaks: [
        { afterLesson: 2, name: 'Morning Break', durationMinutes: 20 },
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([
      { name: 'Period 1', startTime: '08:00', endTime: '08:40', isBreak: false },
      { name: 'Period 2', startTime: '08:45', endTime: '09:25', isBreak: false },
      { name: 'Morning Break', startTime: '09:25', endTime: '09:45', isBreak: true },
      { name: 'Period 3', startTime: '09:45', endTime: '10:25', isBreak: false },
      { name: 'Period 4', startTime: '10:30', endTime: '11:10', isBreak: false },
    ])
  })

  it('rejects a break placed after the last lesson', () => {
    const result = generateBellSchedule({
      startTime: '08:00',
      lessonCount: 4,
      lessonDurationMinutes: 45,
      breaks: [{ afterLesson: 4, name: 'End', durationMinutes: 15 }],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalidBreak')
  })

  it('rejects schedules that overflow past midnight', () => {
    const result = generateBellSchedule({
      startTime: '22:00',
      lessonCount: 4,
      lessonDurationMinutes: 60,
      breaks: [],
    })
    expect(result).toEqual({ ok: false, error: { kind: 'dayOverflow' } })
  })
})

describe('validatePeriodUpdate', () => {
  const existing = [
    { id: asId<'periods'>('p1'), name: 'Period 1', startTime: '08:00', endTime: '08:45', isBreak: false },
    { id: asId<'periods'>('p2'), name: 'Period 2', startTime: '08:45', endTime: '09:30', isBreak: false },
  ]

  it('allows updating a period without conflicting with itself', () => {
    const result = validatePeriodUpdate(existing, 'p1', {
      name: 'Period 1',
      startTime: '08:00',
      endTime: '08:40',
      isBreak: false,
    })
    expect(result.ok).toBe(true)
  })

  it('rejects overlapping another period', () => {
    const result = validatePeriodUpdate(existing, 'p1', {
      name: 'Period 1',
      startTime: '08:00',
      endTime: '09:00',
      isBreak: false,
    })
    expect(result).toEqual({
      ok: false,
      error: { kind: 'overlapsPeriod', existingName: 'Period 2' },
    })
  })
})

describe('generateBellScheduleByBreakTimes', () => {
  it('places breaks at explicit start times between classes', () => {
    const result = generateBellScheduleByBreakTimes({
      startTime: '08:00',
      lessonCount: 4,
      lessonDurationMinutes: 45,
      breaks: [
        { name: 'Morning Break', startTime: '09:30', durationMinutes: 20 },
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([
      { name: 'Period 1', startTime: '08:00', endTime: '08:45', isBreak: false },
      { name: 'Period 2', startTime: '08:45', endTime: '09:30', isBreak: false },
      { name: 'Morning Break', startTime: '09:30', endTime: '09:50', isBreak: true },
      { name: 'Period 3', startTime: '09:50', endTime: '10:35', isBreak: false },
      { name: 'Period 4', startTime: '10:35', endTime: '11:20', isBreak: false },
    ])
  })

  it('rejects overlapping breaks', () => {
    const result = generateBellScheduleByBreakTimes({
      startTime: '08:00',
      lessonCount: 4,
      lessonDurationMinutes: 40,
      breaks: [
        { name: 'Break 1', startTime: '09:30', durationMinutes: 30 },
        { name: 'Break 2', startTime: '09:45', durationMinutes: 15 },
      ],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalidBreak')
  })
})
