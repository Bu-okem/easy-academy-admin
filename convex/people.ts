import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireCapability } from './lib/access'
import { activeTerm, activeYearAndTerm } from './lib/calendar'
import { canViewStudentResults } from '../domain/access/policy'
import { isIsoDate } from '../domain/dates'
import { asId } from '../domain/ids'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'

/**
 * Listings for the People screen. Each role is paginated with Convex cursors;
 * `counts` supplies the totals the table's footer needs, because a cursor page
 * knows nothing about how many rows exist beyond it.
 *
 * Rows come back in creation order. Sorting by name would need the name
 * denormalised onto an index, which is a schema decision, not a query one.
 */

/** Everyone in one role, one page at a time. */
const usersInRole = (ctx: QueryCtx, role: Doc<'users'>['role']) =>
  ctx.db.query('users').withIndex('by_role', (q) => q.eq('role', role))

/**
 * Counting reads every matching row - Convex has no aggregate count. That is
 * fine at a single school's scale and will not be beyond roughly 16,000 users
 * in one role, at which point these become a maintained counter table.
 */
export const counts = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, 'people.view')

    return {
      students: (await usersInRole(ctx, 'student').collect()).length,
      teachers: (await usersInRole(ctx, 'teacher').collect()).length,
      staff: (await usersInRole(ctx, 'staff').collect()).length,
      families: (await usersInRole(ctx, 'parent').collect()).length,
    }
  },
})

const today = () => new Date().toISOString().slice(0, 10)

export const listStudents = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireCapability(ctx, 'people.view')
    const users = await usersInRole(ctx, 'student').paginate(paginationOpts)

    const rows = await Promise.all(
      users.page.map(async (user) => {
        const student = await ctx.db
          .query('students')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .first()

        const section = student?.currentClassSectionId
          ? await ctx.db.get(student.currentClassSectionId)
          : null

        // Today's register entry, if one has been taken for this student.
        const attendance =
          student && student.currentClassSectionId
            ? await ctx.db
                .query('attendanceRecords')
                .withIndex('unique_daily_attendance', (q) =>
                  q
                    .eq('studentId', student._id)
                    .eq('classSectionId', student.currentClassSectionId as Id<'classSections'>)
                    .eq('attendanceDate', today())
                )
                .first()
            : null

        return {
          id: user._id,
          fullName: user.fullName,
          studentId: student?._id ?? null,
          classSectionId: student?.currentClassSectionId ?? null,
          classSection: section?.sectionName ?? null,
          dateOfBirth: student?.dateOfBirth ?? null,
          attendance: attendance?.status ?? null,
        }
      })
    )

    return { ...users, page: rows }
  },
})

export const listTeachers = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireCapability(ctx, 'people.view')
    const users = await usersInRole(ctx, 'teacher').paginate(paginationOpts)

    // The term everything is counted against, resolved once for the whole page.
    const currentTerm = await activeTerm(ctx)

    const rows = await Promise.all(
      users.page.map(async (user) => {
        const teacher = await ctx.db
          .query('teachers')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .first()

        const assignments =
          teacher && currentTerm
            ? await ctx.db
                .query('teachingAssignments')
                .withIndex('by_teacher_term', (q) =>
                  q.eq('teacherId', teacher._id).eq('termId', currentTerm._id)
                )
                .collect()
            : []

        const subjects = await Promise.all(
          assignments.map(async (a) => (await ctx.db.get(a.subjectId))?.name ?? null)
        )

        return {
          id: user._id,
          fullName: user.fullName,
          specialization: teacher?.specialization ?? null,
          // Distinct: a teacher taking one subject with three classes lists it once.
          subjects: [...new Set(subjects.filter((name): name is string => name !== null))].join(', '),
          classCount: new Set(
            assignments.map((a) => a.classSectionId).filter(Boolean)
          ).size,
        }
      })
    )

    return { ...users, page: rows }
  },
})

export const listStaff = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireCapability(ctx, 'people.view')
    const users = await usersInRole(ctx, 'staff').paginate(paginationOpts)

    const rows = await Promise.all(
      users.page.map(async (user) => {
        const record = await ctx.db
          .query('staff')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .first()

        return {
          id: user._id,
          fullName: user.fullName,
          jobTitle: record?.jobTitle ?? null,
          department: record?.department ?? null,
        }
      })
    )

    return { ...users, page: rows }
  },
})

export const listFamilies = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireCapability(ctx, 'people.view')
    const users = await usersInRole(ctx, 'parent').paginate(paginationOpts)

    const rows = await Promise.all(
      users.page.map(async (parent) => {
        const links = await ctx.db
          .query('parentStudentRelations')
          .withIndex('by_parent', (q) => q.eq('parentId', parent._id))
          .collect()

        const children = await Promise.all(
          links.map(async (link) => {
            const student = await ctx.db.get(link.studentId)
            const user = student ? await ctx.db.get(student.userId) : null
            return user?.fullName ?? null
          })
        )

        return {
          id: parent._id,
          parentName: parent.fullName,
          children: children.filter((name): name is string => name !== null),
        }
      })
    )

    return { ...users, page: rows }
  },
})

/**
 * Teachers as pickable options.
 *
 * attendanceRecords.teacherId is required - the schema records who observed the
 * student. An administrator taking or correcting a register from this panel is
 * not a teacher, so the observer has to be chosen explicitly rather than
 * inferred from who is signed in. See docs/DEVLOG.md entry 13.
 */
export const teacherOptions = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, 'people.view')
    const users = await usersInRole(ctx, 'teacher').collect()

    const options = await Promise.all(
      users.map(async (user) => {
        const teacher = await ctx.db
          .query('teachers')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .first()
        return teacher ? { id: teacher._id, name: user.fullName } : null
      })
    )

    return options.filter((option): option is { id: Id<'teachers'>; name: string } => option !== null)
  },
})

const roleTab: Record<Doc<'users'>['role'], string> = {
  student: '/people?tab=students',
  teacher: '/people?tab=teachers',
  staff: '/people?tab=staff',
  parent: '/people?tab=families',
  admin: '/people?tab=staff',
}

const roleLabel: Record<Doc<'users'>['role'], string> = {
  student: 'Student',
  teacher: 'Teacher',
  staff: 'Staff',
  parent: 'Parent',
  admin: 'Administrator',
}

/** Global top-bar search across people and class sections. */
export const search = query({
  args: { term: v.string() },
  handler: async (ctx, { term }) => {
    await requireCapability(ctx, 'people.view')
    const needle = term.trim().toLowerCase()
    if (needle.length < 2) return []

    const [users, sections] = await Promise.all([
      ctx.db.query('users').collect(),
      ctx.db.query('classSections').collect(),
    ])

    const userMatches = users
      .filter(
        (user) =>
          user.fullName.toLowerCase().includes(needle) ||
          user.email.toLowerCase().includes(needle)
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map((user) => ({
        id: `user-${user._id}`,
        label: user.fullName,
        detail: `${roleLabel[user.role]} · ${user.email}`,
        to: `${roleTab[user.role]}&profile=${user._id}`,
      }))

    const sectionMatches = sections
      .filter((section) => section.sectionName.toLowerCase().includes(needle))
      .sort((a, b) => a.sectionName.localeCompare(b.sectionName))
      .map((section) => ({
        id: `section-${section._id}`,
        label: section.sectionName,
        detail: 'Class section',
        to: `/operations?section=${section._id}`,
      }))

    return [...userMatches, ...sectionMatches].slice(0, 8)
  },
})

const DAY_ORDER: Record<Doc<'timetableSlots'>['dayOfWeek'], number> = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
}

/** Complete profile for a single person across role tables and linked records. */
export const profile = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const viewer = await requireCapability(ctx, 'people.view')
    const user = await ctx.db.get(userId)
    if (!user) return null

    const calendar = await activeYearAndTerm(ctx)
    const currentTerm = calendar?.currentTerm ?? null
    const base = {
      userId: user._id,
      fullName: user.fullName,
      email: user.email,
      roleLabel: roleLabel[user.role],
      termName: currentTerm?.name ?? null,
    }

    if (user.role === 'student') {
      const student = await ctx.db
        .query('students')
        .withIndex('by_user', (q) => q.eq('userId', user._id))
        .first()

      if (!student) {
        return {
          ...base,
          kind: 'student' as const,
          studentId: null,
          classSectionId: null,
          dateOfBirth: null,
          sectionName: null,
          gradeName: null,
          parents: [],
          enrollments: [],
          electives: [],
          attendance: {
            counts: { present: 0, late: 0, absent: 0, excused: 0 },
            recent: [],
          },
          behavior: [],
          results: null,
        }
      }

      const [section, parentLinks, rawEnrollments] = await Promise.all([
        student.currentClassSectionId ? ctx.db.get(student.currentClassSectionId) : null,
        ctx.db
          .query('parentStudentRelations')
          .withIndex('by_student', (q) => q.eq('studentId', student._id))
          .collect(),
        ctx.db
          .query('studentEnrollments')
          .withIndex('by_student_year', (q) => q.eq('studentId', student._id))
          .collect(),
      ])

      const gradeLevel = section ? await ctx.db.get(section.gradeLevelId) : null

      const parents = (
        await Promise.all(
          parentLinks.map(async (link) => {
            const parent = await ctx.db.get(link.parentId)
            return parent
              ? { userId: parent._id, fullName: parent.fullName, email: parent.email }
              : null
          })
        )
      )
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((a, b) => a.fullName.localeCompare(b.fullName))

      const enrollments = (
        await Promise.all(
          rawEnrollments.map(async (enrolment) => {
            const [year, enrolledSection] = await Promise.all([
              ctx.db.get(enrolment.academicYearId),
              ctx.db.get(enrolment.classSectionId),
            ])
            return {
              id: enrolment._id,
              yearName: year?.name ?? 'Unknown year',
              isActiveYear: year?.isActive ?? false,
              sectionName: enrolledSection?.sectionName ?? 'Unknown class',
            }
          })
        )
      ).sort((a, b) => b.yearName.localeCompare(a.yearName))

      const [electiveRows, attendanceRows, behaviorRows, summary] = currentTerm
        ? await Promise.all([
            ctx.db
              .query('studentSubjectEnrollments')
              .withIndex('by_student_term', (q) =>
                q.eq('studentId', student._id).eq('termId', currentTerm._id)
              )
              .collect(),
            ctx.db
              .query('attendanceRecords')
              .withIndex('by_student_term', (q) =>
                q.eq('studentId', student._id).eq('termId', currentTerm._id)
              )
              .collect(),
            ctx.db
              .query('behaviorRecords')
              .withIndex('by_student_term', (q) =>
                q.eq('studentId', student._id).eq('termId', currentTerm._id)
              )
              .collect(),
            ctx.db
              .query('termSummaries')
              .withIndex('unique_student_term', (q) =>
                q.eq('studentId', student._id).eq('termId', currentTerm._id)
              )
              .first(),
          ])
        : [[], [], [], null]

      const electives = (
        await Promise.all(
          electiveRows.map(async (row) => {
            const subject = await ctx.db.get(row.subjectId)
            return subject ? { id: subject._id, name: subject.name, code: subject.code } : null
          })
        )
      )
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((a, b) => a.name.localeCompare(b.name))

      const counts = { present: 0, late: 0, absent: 0, excused: 0 }
      for (const record of attendanceRows) counts[record.status]++

      const recentAttendance = [...attendanceRows]
        .sort((a, b) => b.attendanceDate.localeCompare(a.attendanceDate))
        .slice(0, 5)
        .map((record) => ({
          id: record._id,
          attendanceDate: record.attendanceDate,
          status: record.status,
          remarks: record.remarks ?? null,
        }))

      const behavior = (
        await Promise.all(
          behaviorRows.map(async (record) => {
            const teacher = await ctx.db.get(record.teacherId)
            const teacherUser = teacher ? await ctx.db.get(teacher.userId) : null
            return {
              id: record._id,
              type: record.type,
              severityLevel: record.severityLevel,
              description: record.description,
              incidentDate: record.incidentDate,
              actionTaken: record.actionTaken ?? null,
              teacherName: teacherUser?.fullName ?? 'Unknown teacher',
            }
          })
        )
      ).sort((a, b) => b.incidentDate.localeCompare(a.incidentDate))

      let results: {
        termGpa: number | null
        isPublished: boolean
        formTeacherRemark: string | null
        principalRemark: string | null
        subjects: {
          id: Id<'termSubjectResults'>
          subjectName: string
          subjectCode: string
          cumulativeScore: number
          letterGrade: string
          teacherRemark: string | null
        }[]
      } | null = null

      if (
        currentTerm &&
        summary &&
        canViewStudentResults(viewer, {
          studentId: asId(student._id),
          isPublished: summary.isPublished,
        })
      ) {
        const subjectRows = await ctx.db
          .query('termSubjectResults')
          .withIndex('unique_student_term_subject', (q) =>
            q.eq('studentId', student._id).eq('termId', currentTerm._id)
          )
          .collect()

        const hydratedSubjects = await Promise.all(
          subjectRows.map(async (row) => {
            const subject = await ctx.db.get(row.subjectId)
            return {
              id: row._id,
              subjectName: subject?.name ?? 'Unknown subject',
              subjectCode: subject?.code ?? '',
              cumulativeScore: row.cumulativeScore,
              letterGrade: row.letterGrade,
              teacherRemark: row.teacherRemark ?? null,
            }
          })
        )

        results = {
          termGpa: summary.termGpa ?? null,
          isPublished: summary.isPublished,
          formTeacherRemark: summary.formTeacherRemark ?? null,
          principalRemark: summary.principalRemark ?? null,
          subjects: hydratedSubjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
        }
      }

      return {
        ...base,
        kind: 'student' as const,
        studentId: student._id,
        classSectionId: student.currentClassSectionId ?? null,
        dateOfBirth: student.dateOfBirth,
        sectionName: section?.sectionName ?? null,
        gradeName: gradeLevel?.name ?? null,
        parents,
        enrollments,
        electives,
        attendance: { counts, recent: recentAttendance },
        behavior,
        results,
      }
    }

    if (user.role === 'teacher') {
      const teacher = await ctx.db
        .query('teachers')
        .withIndex('by_user', (q) => q.eq('userId', user._id))
        .first()

      if (!teacher || !currentTerm) {
        return {
          ...base,
          kind: 'teacher' as const,
          teacherId: teacher?._id ?? null,
          specialization: teacher?.specialization ?? null,
          assignments: [],
          schedule: [],
        }
      }

      const [rawAssignments, rawSlots] = await Promise.all([
        ctx.db
          .query('teachingAssignments')
          .withIndex('by_teacher_term', (q) =>
            q.eq('teacherId', teacher._id).eq('termId', currentTerm._id)
          )
          .collect(),
        ctx.db
          .query('timetableSlots')
          .withIndex('prevent_teacher_collision', (q) =>
            q.eq('termId', currentTerm._id).eq('teacherId', teacher._id)
          )
          .collect(),
      ])

      const assignments = (
        await Promise.all(
          rawAssignments.map(async (assignment) => {
            const [subject, section] = await Promise.all([
              ctx.db.get(assignment.subjectId),
              assignment.classSectionId ? ctx.db.get(assignment.classSectionId) : null,
            ])
            return {
              id: assignment._id,
              subjectName: subject?.name ?? 'Unknown subject',
              subjectCode: subject?.code ?? '',
              sectionName: section?.sectionName ?? null,
            }
          })
        )
      ).sort(
        (a, b) =>
          a.subjectName.localeCompare(b.subjectName) ||
          (a.sectionName ?? '').localeCompare(b.sectionName ?? '')
      )

      const schedule = (
        await Promise.all(
          rawSlots.map(async (slot) => {
            const [subject, section, classroom, period] = await Promise.all([
              ctx.db.get(slot.subjectId),
              ctx.db.get(slot.classSectionId),
              ctx.db.get(slot.classroomId),
              ctx.db.get(slot.periodId),
            ])
            return {
              id: slot._id,
              dayOfWeek: slot.dayOfWeek,
              periodName: period?.name ?? 'Period',
              startTime: period?.startTime ?? '',
              endTime: period?.endTime ?? '',
              subjectName: subject?.name ?? 'Unknown subject',
              sectionName: section?.sectionName ?? 'Unknown class',
              classroomName: classroom?.name ?? 'Unknown room',
            }
          })
        )
      ).sort(
        (a, b) =>
          DAY_ORDER[a.dayOfWeek] - DAY_ORDER[b.dayOfWeek] ||
          a.startTime.localeCompare(b.startTime)
      )

      return {
        ...base,
        kind: 'teacher' as const,
        teacherId: teacher._id,
        specialization: teacher.specialization ?? null,
        assignments,
        schedule,
      }
    }

    if (user.role === 'staff') {
      const record = await ctx.db
        .query('staff')
        .withIndex('by_user', (q) => q.eq('userId', user._id))
        .first()

      return {
        ...base,
        kind: 'staff' as const,
        staffId: record?._id ?? null,
        jobTitle: record?.jobTitle ?? null,
        department: record?.department ?? null,
      }
    }

    const links = await ctx.db
      .query('parentStudentRelations')
      .withIndex('by_parent', (q) => q.eq('parentId', user._id))
      .collect()

    const children = (
      await Promise.all(
        links.map(async (link) => {
          const student = await ctx.db.get(link.studentId)
          if (!student) return null
          const [studentUser, section] = await Promise.all([
            ctx.db.get(student.userId),
            student.currentClassSectionId ? ctx.db.get(student.currentClassSectionId) : null,
          ])
          if (!studentUser) return null
          return {
            userId: studentUser._id,
            studentId: student._id,
            fullName: studentUser.fullName,
            dateOfBirth: student.dateOfBirth,
            sectionName: section?.sectionName ?? null,
          }
        })
      )
    )
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.fullName.localeCompare(b.fullName))

    return {
      ...base,
      kind: 'family' as const,
      role: user.role,
      children,
    }
  },
})

/** Pick-list options for People enrolment and assignment modals. */
export const enrollmentOptions = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, 'people.view')
    const [sections, subjects, students] = await Promise.all([
      ctx.db.query('classSections').collect(),
      ctx.db.query('subjects').collect(),
      ctx.db.query('students').collect(),
    ])

    const hydratedStudents = await Promise.all(
      students.map(async (student) => {
        const user = await ctx.db.get(student.userId)
        return { id: student._id, name: user?.fullName ?? 'Unknown student' }
      })
    )

    return {
      sections: sections
        .map((section) => ({ id: section._id, name: section.sectionName }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      subjects: subjects
        .filter((subject) => subject.code !== 'FORM')
        .map((subject) => ({ id: subject._id, name: subject.name, code: subject.code }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      students: hydratedStudents.sort((a, b) => a.name.localeCompare(b.name)),
    }
  },
})

async function normalizeAndCheckUniqueEmail(ctx: MutationCtx, rawEmail: string): Promise<string> {
  const email = rawEmail.trim().toLowerCase()
  if (email === '') {
    throw new ConvexError({ code: 'emailRequired', message: 'An email address is required.' })
  }
  const existing = await ctx.db
    .query('users')
    .withIndex('by_email', (q) => q.eq('email', email))
    .first()
  if (existing) {
    throw new ConvexError({
      code: 'duplicateEmail',
      message: `${email} is already registered to another user.`,
    })
  }
  return email
}

function requireText(raw: string, field: string): string {
  const trimmed = raw.trim()
  if (trimmed === '') {
    throw new ConvexError({ code: 'required', message: `${field} is required.` })
  }
  return trimmed
}

export const createStudent = mutation({
  args: {
    fullName: v.string(),
    email: v.string(),
    dateOfBirth: v.string(),
    classSectionId: v.id('classSections'),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'academics.manage')
    const fullName = requireText(args.fullName, 'Full name')
    const email = await normalizeAndCheckUniqueEmail(ctx, args.email)
    const dob = args.dateOfBirth.trim()
    if (!isIsoDate(dob)) {
      throw new ConvexError({ code: 'invalidDate', message: `"${args.dateOfBirth}" is not a valid YYYY-MM-DD date.` })
    }

    const section = await ctx.db.get(args.classSectionId)
    if (!section) {
      throw new ConvexError({ code: 'sectionNotFound', message: 'That class section no longer exists.' })
    }

    const calendar = await activeYearAndTerm(ctx)
    if (!calendar) {
      throw new ConvexError({
        code: 'noActiveYear',
        message: 'Set an active academic year before enrolling students.',
      })
    }

    const userId = await ctx.db.insert('users', {
      email,
      fullName,
      role: 'student',
      passwordHash: 'managed-by-clerk',
    })
    const studentId = await ctx.db.insert('students', {
      userId,
      dateOfBirth: dob,
      currentClassSectionId: args.classSectionId,
    })
    await ctx.db.insert('studentEnrollments', {
      studentId,
      classSectionId: args.classSectionId,
      academicYearId: calendar.activeYear._id,
    })

    return studentId
  },
})

export const enrollStudentSubject = mutation({
  args: {
    studentId: v.id('students'),
    subjectId: v.id('subjects'),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'academics.manage')
    const term = await activeTerm(ctx)
    if (!term) {
      throw new ConvexError({ code: 'noActiveTerm', message: 'No term is active.' })
    }

    const existing = await ctx.db
      .query('studentSubjectEnrollments')
      .withIndex('by_student_term', (q) =>
        q.eq('studentId', args.studentId).eq('termId', term._id)
      )
      .collect()

    if (existing.some((item) => item.subjectId === args.subjectId)) {
      throw new ConvexError({
        code: 'alreadyEnrolled',
        message: 'That student is already enrolled in this subject for the active term.',
      })
    }

    return await ctx.db.insert('studentSubjectEnrollments', {
      studentId: args.studentId,
      subjectId: args.subjectId,
      termId: term._id,
    })
  },
})

export const createTeacher = mutation({
  args: {
    fullName: v.string(),
    email: v.string(),
    specialization: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'academics.manage')
    const fullName = requireText(args.fullName, 'Full name')
    const email = await normalizeAndCheckUniqueEmail(ctx, args.email)
    const trimmedSpec = args.specialization?.trim()
    const specialization = trimmedSpec === '' ? undefined : trimmedSpec

    const userId = await ctx.db.insert('users', {
      email,
      fullName,
      role: 'teacher',
      passwordHash: 'managed-by-clerk',
    })
    return await ctx.db.insert('teachers', { userId, specialization })
  },
})

export const assignTeacher = mutation({
  args: {
    teacherId: v.id('teachers'),
    subjectId: v.id('subjects'),
    classSectionId: v.optional(v.id('classSections')),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'academics.manage')
    const term = await activeTerm(ctx)
    if (!term) {
      throw new ConvexError({ code: 'noActiveTerm', message: 'No term is active.' })
    }

    const existing = await ctx.db
      .query('teachingAssignments')
      .withIndex('by_teacher_term', (q) =>
        q.eq('teacherId', args.teacherId).eq('termId', term._id)
      )
      .collect()

    if (
      existing.some(
        (item) =>
          item.subjectId === args.subjectId && item.classSectionId === args.classSectionId
      )
    ) {
      throw new ConvexError({
        code: 'duplicateAssignment',
        message: 'That teacher is already assigned to that subject and class this term.',
      })
    }

    return await ctx.db.insert('teachingAssignments', {
      teacherId: args.teacherId,
      subjectId: args.subjectId,
      classSectionId: args.classSectionId,
      termId: term._id,
    })
  },
})

export const createStaff = mutation({
  args: {
    fullName: v.string(),
    email: v.string(),
    jobTitle: v.string(),
    department: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'academics.manage')
    const fullName = requireText(args.fullName, 'Full name')
    const email = await normalizeAndCheckUniqueEmail(ctx, args.email)
    const jobTitle = requireText(args.jobTitle, 'Job title')
    const department = requireText(args.department, 'Department')

    const userId = await ctx.db.insert('users', {
      email,
      fullName,
      role: 'staff',
      passwordHash: 'managed-by-clerk',
    })
    return await ctx.db.insert('staff', { userId, jobTitle, department })
  },
})

export const linkParent = mutation({
  args: {
    fullName: v.string(),
    email: v.string(),
    studentId: v.id('students'),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'academics.manage')
    const email = args.email.trim().toLowerCase()
    if (email === '') {
      throw new ConvexError({ code: 'emailRequired', message: 'An email address is required.' })
    }

    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email))
      .first()

    if (existingUser && existingUser.role !== 'parent') {
      throw new ConvexError({
        code: 'wrongRole',
        message: `${email} belongs to a ${existingUser.role} account.`,
      })
    }

    const parentId = existingUser
      ? existingUser._id
      : await ctx.db.insert('users', {
          email,
          fullName: requireText(args.fullName, 'Parent full name'),
          role: 'parent',
          passwordHash: 'managed-by-clerk',
        })

    const links = await ctx.db
      .query('parentStudentRelations')
      .withIndex('by_parent', (q) => q.eq('parentId', parentId))
      .collect()

    if (links.some((link) => link.studentId === args.studentId)) {
      throw new ConvexError({
        code: 'alreadyLinked',
        message: 'That parent is already linked to this student.',
      })
    }

    return await ctx.db.insert('parentStudentRelations', {
      parentId,
      studentId: args.studentId,
    })
  },
})

export const updateStudentSection = mutation({
  args: {
    studentId: v.id('students'),
    classSectionId: v.union(v.id('classSections'), v.null()),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'academics.manage')
    const student = await ctx.db.get(args.studentId)
    if (!student) {
      throw new ConvexError({ code: 'notFound', message: 'Student record not found.' })
    }
    if (args.classSectionId !== null) {
      const section = await ctx.db.get(args.classSectionId)
      if (!section) {
        throw new ConvexError({ code: 'notFound', message: 'Class section not found.' })
      }
    }
    await ctx.db.patch(args.studentId, {
      currentClassSectionId: args.classSectionId ?? undefined,
    })
    return { updated: true }
  },
})

export const updateTeacher = mutation({
  args: {
    teacherId: v.id('teachers'),
    specialization: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'academics.manage')
    const teacher = await ctx.db.get(args.teacherId)
    if (!teacher) {
      throw new ConvexError({ code: 'notFound', message: 'Teacher record not found.' })
    }
    const trimmed = args.specialization?.trim()
    await ctx.db.patch(args.teacherId, {
      specialization: trimmed && trimmed.length > 0 ? trimmed : undefined,
    })
    return { updated: true }
  },
})

export const updateStaff = mutation({
  args: {
    staffId: v.id('staff'),
    jobTitle: v.string(),
    department: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'academics.manage')
    const record = await ctx.db.get(args.staffId)
    if (!record) {
      throw new ConvexError({ code: 'notFound', message: 'Staff record not found.' })
    }
    await ctx.db.patch(args.staffId, {
      jobTitle: requireText(args.jobTitle, 'Job title'),
      department: requireText(args.department, 'Department'),
    })
    return { updated: true }
  },
})
