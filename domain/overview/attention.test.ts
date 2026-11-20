import { describe, expect, it } from 'vitest'
import type { AttendanceStatus } from '../attendance/ports'
import {
  attentionItems,
  describeAttention,
  severityOf,
  type RegisterStatus,
} from './attention'

const register = (
  sectionName: string,
  enrolled: number,
  ...statuses: AttendanceStatus[]
): RegisterStatus => ({ sectionName, enrolled, statuses })

describe('attentionItems', () => {
  describe('registers nobody has started', () => {
    it('raises one item per untouched section', () => {
      const items = attentionItems([register('10A', 3), register('10B', 2)])

      expect(items).toEqual([
        { kind: 'registerNotTaken', sectionName: '10A' },
        { kind: 'registerNotTaken', sectionName: '10B' },
      ])
    })

    it('ignores a section with nobody enrolled', () => {
      // An empty section has no register to take, so it is not a task.
      expect(attentionItems([register('11C', 0)])).toEqual([])
    })
  })

  describe('registers part done', () => {
    it('reports how far along a section is', () => {
      const items = attentionItems([register('10A', 3, 'present', 'absent')])

      expect(items).toContainEqual({
        kind: 'registerIncomplete',
        sectionName: '10A',
        recorded: 2,
        enrolled: 3,
      })
    })

    it('says nothing about a complete register', () => {
      const items = attentionItems([register('10A', 2, 'present', 'present')])

      expect(items).toEqual([])
    })

    it('does not flag a register with more entries than enrolments', () => {
      // A student who moved section mid-term can leave an extra row behind;
      // that is not "incomplete" and must not be reported as such.
      expect(attentionItems([register('10A', 2, 'present', 'present', 'late')])).toEqual([])
    })
  })

  describe('absences', () => {
    it('totals absences across every register as a single line', () => {
      const items = attentionItems([
        register('10A', 2, 'present', 'absent'),
        register('10B', 2, 'absent', 'absent'),
      ])

      expect(items).toContainEqual({ kind: 'studentsAbsent', count: 3 })
      expect(items.filter((i) => i.kind === 'studentsAbsent')).toHaveLength(1)
    })

    it('counts only absences, not lateness or excused absence', () => {
      const items = attentionItems([register('10A', 4, 'present', 'late', 'excused', 'absent')])

      expect(items).toContainEqual({ kind: 'studentsAbsent', count: 1 })
    })

    it('says nothing when everyone turned up', () => {
      expect(attentionItems([register('10A', 2, 'present', 'present')])).toEqual([])
    })
  })

  describe('ordering', () => {
    it('puts untouched registers before part-done ones, and absences last', () => {
      const items = attentionItems([
        register('11A', 3, 'present', 'absent'),
        register('10B', 2),
      ])

      expect(items.map((item) => item.kind)).toEqual([
        'registerNotTaken',
        'registerIncomplete',
        'studentsAbsent',
      ])
    })

    it('lists sections alphabetically so the list does not reshuffle', () => {
      const items = attentionItems([register('11B', 1), register('10A', 1), register('10 Science', 1)])

      expect(items.map((item) => 'sectionName' in item && item.sectionName)).toEqual([
        '10 Science',
        '10A',
        '11B',
      ])
    })
  })

  it('has nothing to say when the day is under control', () => {
    expect(attentionItems([register('10A', 1, 'present')])).toEqual([])
  })
})

describe('describeAttention', () => {
  it('names the section that needs a register', () => {
    expect(describeAttention({ kind: 'registerNotTaken', sectionName: '10B' }).title).toBe(
      '10B has no register today'
    )
  })

  it('states progress on a part-done register', () => {
    const { detail } = describeAttention({
      kind: 'registerIncomplete',
      sectionName: '10A',
      recorded: 2,
      enrolled: 3,
    })

    expect(detail).toBe('2 of 3 students recorded.')
  })

  it('reads naturally for a single absence', () => {
    expect(describeAttention({ kind: 'studentsAbsent', count: 1 }).title).toBe(
      '1 student absent today'
    )
  })

  it('pluralises for several', () => {
    expect(describeAttention({ kind: 'studentsAbsent', count: 4 }).title).toBe(
      '4 students absent today'
    )
  })
})

describe('severityOf', () => {
  it('treats a missing register as a warning', () => {
    expect(severityOf({ kind: 'registerNotTaken', sectionName: '10A' })).toBe('warning')
  })

  it('treats a tally of absences as informational', () => {
    expect(severityOf({ kind: 'studentsAbsent', count: 2 })).toBe('accent')
  })
})
