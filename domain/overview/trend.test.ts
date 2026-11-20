import { describe, expect, it } from 'vitest'
import { attendanceTrend, trendLabel, type DayRegister } from './trend'

const day = (date: string, ...statuses: DayRegister['statuses']): DayRegister => ({
  date,
  statuses,
})

describe('attendanceTrend', () => {
  it('turns each day into a percentage', () => {
    const trend = attendanceTrend([day('2026-09-07', 'present', 'present', 'absent', 'absent')])

    expect(trend).toEqual([{ date: '2026-09-07', rate: 50 }])
  })

  it('drops a day nobody took a register for', () => {
    // Plotting zero would read as "nobody came", which is a different claim.
    const trend = attendanceTrend([day('2026-09-07'), day('2026-09-08', 'present')])

    expect(trend).toEqual([{ date: '2026-09-08', rate: 100 }])
  })

  it('keeps a day where a register was taken and nobody came', () => {
    expect(attendanceTrend([day('2026-09-07', 'absent', 'absent')])).toEqual([
      { date: '2026-09-07', rate: 0 },
    ])
  })

  it('returns points in date order regardless of input order', () => {
    const trend = attendanceTrend([
      day('2026-09-09', 'present'),
      day('2026-09-07', 'present'),
      day('2026-09-08', 'present'),
    ])

    expect(trend.map((point) => point.date)).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
    ])
  })

  it('has nothing to plot when no register was ever taken', () => {
    expect(attendanceTrend([day('2026-09-07'), day('2026-09-08')])).toEqual([])
  })
})

describe('trendLabel', () => {
  it('formats a short axis label', () => {
    expect(trendLabel('2026-09-07')).toBe('7 Sep')
  })

  it('drops the leading zero on the day', () => {
    expect(trendLabel('2026-12-01')).toBe('1 Dec')
  })
})
