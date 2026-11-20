import { describe, expect, it } from 'vitest'
import { asId } from '../ids'
import {
  can,
  canEditRemarks,
  canViewStudentResults,
  capabilitiesOf,
  describeDenial,
  type Capability,
  type Role,
  type Viewer,
} from './policy'

const roles: Role[] = ['admin', 'teacher', 'staff', 'parent', 'student']

describe('can', () => {
  it('lets an administrator do everything the application guards', () => {
    const everything: Capability[] = [
      'portal.view', 'overview.view', 'people.view', 'academics.manage', 'timetable.view',
      'timetable.manage', 'register.take', 'marks.record', 'results.view',
      'results.calculate', 'results.publish',
    ]

    expect(everything.filter((c) => !can('admin', c))).toEqual([])
  })

  describe('teachers', () => {
    it('may take a register and record marks', () => {
      expect(can('teacher', 'register.take')).toBe(true)
      expect(can('teacher', 'marks.record')).toBe(true)
    })

    it('may not publish results, however much of the work they did', () => {
      // docs/schema.txt: invisible until the administration publishes.
      expect(can('teacher', 'results.publish')).toBe(false)
    })

    it('may not calculate results or change the timetable', () => {
      expect(can('teacher', 'results.calculate')).toBe(false)
      expect(can('teacher', 'timetable.manage')).toBe(false)
    })

    it('may still read the results they helped produce', () => {
      expect(can('teacher', 'results.view')).toBe(true)
    })
  })

  describe('staff', () => {
    it('may look but not touch the academic record', () => {
      expect(can('staff', 'people.view')).toBe(true)
      expect(can('staff', 'timetable.view')).toBe(true)
      expect(can('staff', 'marks.record')).toBe(false)
      expect(can('staff', 'academics.manage')).toBe(false)
    })
  })

  describe('parents and students', () => {
    it.each(['parent', 'student'] as const)('%s holds only portal viewing capability', (role) => {
      expect(capabilitiesOf(role)).toEqual(['portal.view'])
    })

    it.each(['parent', 'student'] as const)('%s cannot see the staff overview', (role) => {
      expect(can(role, 'overview.view')).toBe(false)
      expect(can(role, 'people.view')).toBe(false)
    })
  })

  it('grants academics management to nobody but an administrator', () => {
    expect(roles.filter((role) => can(role, 'academics.manage'))).toEqual(['admin'])
  })

  it('grants publishing to nobody but an administrator', () => {
    expect(roles.filter((role) => can(role, 'results.publish'))).toEqual(['admin'])
  })
})

describe('canViewStudentResults', () => {
  const student = asId<'students'>('student1')
  const sibling = asId<'students'>('student2')
  const stranger = asId<'students'>('student9')

  const viewer = (role: Role, extra: Partial<Viewer> = {}): Viewer => ({
    userId: asId<'users'>('user1'),
    role,
    ...extra,
  })

  describe('staff side', () => {
    it.each(['admin', 'staff', 'teacher'] as const)(
      'lets %s see results before they are published',
      (role) => {
        expect(
          canViewStudentResults(viewer(role), { studentId: student, isPublished: false })
        ).toBe(true)
      }
    )
  })

  describe('a student', () => {
    it('sees their own published results', () => {
      expect(
        canViewStudentResults(viewer('student', { studentId: student }), {
          studentId: student,
          isPublished: true,
        })
      ).toBe(true)
    })

    it('does not see their own results before they are published', () => {
      expect(
        canViewStudentResults(viewer('student', { studentId: student }), {
          studentId: student,
          isPublished: false,
        })
      ).toBe(false)
    })

    it('never sees another student, published or not', () => {
      const me = viewer('student', { studentId: student })

      expect(canViewStudentResults(me, { studentId: stranger, isPublished: true })).toBe(false)
      expect(canViewStudentResults(me, { studentId: stranger, isPublished: false })).toBe(false)
    })
  })

  describe('a parent', () => {
    const parent = viewer('parent', { children: [student, sibling] })

    it('sees each of their children once published', () => {
      expect(canViewStudentResults(parent, { studentId: student, isPublished: true })).toBe(true)
      expect(canViewStudentResults(parent, { studentId: sibling, isPublished: true })).toBe(true)
    })

    it('does not see their own child before publication', () => {
      expect(canViewStudentResults(parent, { studentId: student, isPublished: false })).toBe(false)
    })

    it('never sees a child that is not theirs', () => {
      expect(canViewStudentResults(parent, { studentId: stranger, isPublished: true })).toBe(false)
    })

    it('sees nothing when linked to no children at all', () => {
      expect(
        canViewStudentResults(viewer('parent'), { studentId: student, isPublished: true })
      ).toBe(false)
    })
  })
})

describe('canEditRemarks', () => {
  it('lets an administrator edit teacher, form teacher and principal remarks', () => {
    expect(canEditRemarks('admin')).toEqual({
      teacher: true,
      formTeacher: true,
      principal: true,
    })
  })

  it('lets a teacher edit subject and form teacher remarks, but not the principal remark', () => {
    expect(canEditRemarks('teacher')).toEqual({
      teacher: true,
      formTeacher: true,
      principal: false,
    })
  })

  it.each(['staff', 'parent', 'student'] as const)(
    'keeps all remarks read-only for %s',
    (role) => {
      expect(canEditRemarks(role)).toEqual({
        teacher: false,
        formTeacher: false,
        principal: false,
      })
    }
  )
})

describe('describeDenial', () => {
  it('says what the account cannot do, in plain words', () => {
    expect(describeDenial('results.publish')).toBe('Your account cannot publish results.')
  })
})
