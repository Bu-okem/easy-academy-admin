import type { StudentId, UserId } from '../ids'

export type Role = 'admin' | 'teacher' | 'staff' | 'parent' | 'student'

/**
 * Every action the application guards. Named for what a person is trying to do,
 * not for the function that happens to implement it, so a capability survives
 * the code being reorganised.
 */
export type Capability =
  | 'portal.view'
  | 'overview.view'
  | 'people.view'
  | 'academics.manage'
  | 'timetable.view'
  | 'timetable.manage'
  | 'register.take'
  | 'marks.record'
  | 'results.view'
  | 'results.calculate'
  | 'results.publish'

/**
 * What each role may do.
 *
 * Written as a table rather than scattered `if (role === 'admin')` checks: the
 * whole point is that someone can read this and see the answer, and that adding
 * a role means adding one row rather than auditing every function.
 *
 * Publishing is admin-only on purpose. docs/schema.txt states the report card
 * stays invisible "until the administration explicitly clicks Publish", so a
 * teacher who can enter marks still cannot release them.
 */
const GRANTS: Record<Role, readonly Capability[]> = {
  admin: [
    'portal.view',
    'overview.view',
    'people.view',
    'academics.manage',
    'timetable.view',
    'timetable.manage',
    'register.take',
    'marks.record',
    'results.view',
    'results.calculate',
    'results.publish',
  ],
  staff: ['portal.view', 'overview.view', 'people.view', 'timetable.view', 'results.view'],
  teacher: [
    'portal.view',
    'overview.view',
    'people.view',
    'timetable.view',
    'register.take',
    'marks.record',
    'results.view',
  ],
  parent: ['portal.view'],
  student: ['portal.view'],
}

export function can(role: Role, capability: Capability): boolean {
  return GRANTS[role].includes(capability)
}

export function capabilitiesOf(role: Role): readonly Capability[] {
  return GRANTS[role]
}

/** Who is asking, and what the application knows about them. */
export interface Viewer {
  userId: UserId
  role: Role
  /** Set when the viewer is themselves a student. */
  studentId?: StudentId
  /** Students this viewer is a parent of. */
  children?: readonly StudentId[]
}

/**
 * Whether a viewer may see one student's results.
 *
 * This is the rule the publish gate exists for. Administrators, staff and
 * teachers see results as they are worked on, because they are the people
 * working on them. A student sees their own and a parent sees their children's -
 * **and only once published.** An unpublished report card is working material,
 * and showing a parent a grade that is still being decided is precisely what the
 * `isPublished` flag was added to prevent.
 */
export function canViewStudentResults(
  viewer: Viewer,
  target: { studentId: StudentId; isPublished: boolean }
): boolean {
  switch (viewer.role) {
    case 'admin':
    case 'staff':
    case 'teacher':
      return true
    case 'student':
      return viewer.studentId === target.studentId && target.isPublished
    case 'parent':
      return (viewer.children ?? []).includes(target.studentId) && target.isPublished
  }
}

/**
 * Who may write each kind of report card remark on an unpublished summary.
 *
 * Teachers and administrators enter subject and form-teacher remarks;
 * the principal's remark is reserved for the administration.
 */
export function canEditRemarks(role: Role): {
  teacher: boolean
  formTeacher: boolean
  principal: boolean
} {
  return {
    teacher: can(role, 'marks.record'),
    formTeacher: can(role, 'marks.record'),
    principal: can(role, 'results.publish'),
  }
}

/** Plain-language refusal, in the voice set by docs/DESIGN.md section 6. */
export function describeDenial(capability: Capability): string {
  const actions: Record<Capability, string> = {
    'portal.view': 'see the school portal',
    'overview.view': 'see the school overview',
    'people.view': 'see people records',
    'academics.manage': 'change years, terms or subjects',
    'timetable.view': 'see the timetable',
    'timetable.manage': 'change the timetable',
    'register.take': 'take a register',
    'marks.record': 'record marks',
    'results.view': 'see results',
    'results.calculate': 'calculate results',
    'results.publish': 'publish results',
  }
  return `Your account cannot ${actions[capability]}.`
}
