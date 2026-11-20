import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireCapability } from './lib/access'
import { activeTerm } from './lib/calendar'
import { getFormTeacherForSection } from './lib/formTeacher'
import { convexAttendanceRepository } from './adapters/attendance'
import { convexBehaviorRepository } from './adapters/behavior'
import { asId } from '../domain/ids'
import {
  describeRegisterProblem,
  recordClassRegister,
} from '../domain/attendance/recordClassRegister'
import { describeBehaviorProblem, recordBehavior } from '../domain/behavior/recordBehavior'

const status = v.union(
  v.literal('present'),
  v.literal('absent'),
  v.literal('late'),
  v.literal('excused')
)

/**
 * One class's register for one day: everyone enrolled, and whatever has already
 * been recorded for them. Students with no entry come back with a null status,
 * which the screen shows as not yet marked rather than as present.
 */
export const register = query({
  args: {
    classSectionId: v.optional(v.id('classSections')),
    attendanceDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'register.take')
    const term = await activeTerm(ctx)
    if (!term) return null

    const allSections = await ctx.db.query('classSections').collect()
    const section = args.classSectionId
      ? await ctx.db.get(args.classSectionId)
      : [...allSections].sort((a, b) => a.sectionName.localeCompare(b.sectionName))[0]
    if (!section) return null

    const attendanceDate = args.attendanceDate ?? new Date().toISOString().slice(0, 10)

    const enrolments = await ctx.db
      .query('studentEnrollments')
      .withIndex('by_class_year', (q) =>
        q.eq('classSectionId', section._id).eq('academicYearId', term.academicYearId)
      )
      .collect()

    const students = await Promise.all(
      enrolments.map(async (enrolment) => {
        const student = await ctx.db.get(enrolment.studentId)
        const user = student ? await ctx.db.get(student.userId) : null

        const record = await ctx.db
          .query('attendanceRecords')
          .withIndex('unique_daily_attendance', (q) =>
            q
              .eq('studentId', enrolment.studentId)
              .eq('classSectionId', section._id)
              .eq('attendanceDate', attendanceDate)
          )
          .first()

        return {
          studentId: enrolment.studentId,
          fullName: user?.fullName ?? 'Unknown student',
          status: record?.status ?? null,
          remarks: record?.remarks ?? null,
        }
      })
    )

    const formTeacher = await getFormTeacherForSection(ctx.db, section._id, term._id)

    return {
      section: { id: section._id, name: section.sectionName },
      term: { id: term._id, name: term.name, startDate: term.startDate, endDate: term.endDate },
      attendanceDate,
      formTeacher,
      alreadyTaken: students.some((student) => student.status !== null),
      students: students.sort((a, b) => a.fullName.localeCompare(b.fullName)),
    }
  },
})

/**
 * Takes a whole class register. Thin adapter - the all-or-nothing rule and the
 * date checks live in domain/attendance/recordClassRegister.ts.
 *
 * Convex mutations are transactional, which is what lets the domain promise that
 * a refusal leaves nothing behind.
 */
export const takeRegister = mutation({
  args: {
    classSectionId: v.id('classSections'),
    teacherId: v.id('teachers'),
    attendanceDate: v.string(),
    entries: v.array(
      v.object({
        studentId: v.id('students'),
        status,
        remarks: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'register.take')
    const term = await activeTerm(ctx)
    if (!term) throw new ConvexError({ code: 'noActiveTerm', message: 'No term is active.' })

    const result = await recordClassRegister(convexAttendanceRepository(ctx.db), {
      classSectionId: asId(args.classSectionId),
      teacherId: asId(args.teacherId),
      termId: asId(term._id),
      attendanceDate: args.attendanceDate,
      entries: args.entries.map((entry) => ({
        studentId: asId(entry.studentId),
        status: entry.status,
        remarks: entry.remarks,
      })),
    })

    if (!result.ok) {
      throw new ConvexError({
        code: result.error.kind,
        message: describeRegisterProblem(result.error),
      })
    }

    return result.value
  },
})

/**
 * Behaviour records (merits and demerits) for the active term, optionally
 * scoped to one class section.
 */
export const behavior = query({
  args: { classSectionId: v.optional(v.id('classSections')) },
  handler: async (ctx, { classSectionId }) => {
    await requireCapability(ctx, 'register.take')
    const term = await activeTerm(ctx)
    if (!term) return null

    const enrolments = classSectionId
      ? await ctx.db
          .query('studentEnrollments')
          .withIndex('by_class_year', (q) =>
            q.eq('classSectionId', classSectionId).eq('academicYearId', term.academicYearId)
          )
          .collect()
      : await ctx.db
          .query('studentEnrollments')
          .withIndex('by_year', (q) => q.eq('academicYearId', term.academicYearId))
          .collect()

    const studentMap = new Map<
      string,
      { id: (typeof enrolments)[number]['studentId']; fullName: string; sectionName: string }
    >()

    await Promise.all(
      enrolments.map(async (enrolment) => {
        if (studentMap.has(enrolment.studentId)) return
        const [student, section] = await Promise.all([
          ctx.db.get(enrolment.studentId),
          ctx.db.get(enrolment.classSectionId),
        ])
        const user = student ? await ctx.db.get(student.userId) : null
        studentMap.set(enrolment.studentId, {
          id: enrolment.studentId,
          fullName: user?.fullName ?? 'Unknown student',
          sectionName: section?.sectionName ?? 'Unknown class',
        })
      })
    )

    const students = [...studentMap.values()].sort((a, b) => a.fullName.localeCompare(b.fullName))

    const rawRecords = (
      await Promise.all(
        students.map((student) =>
          ctx.db
            .query('behaviorRecords')
            .withIndex('by_student_term', (q) =>
              q.eq('studentId', student.id).eq('termId', term._id)
            )
            .collect()
        )
      )
    ).flat()

    const records = await Promise.all(
      rawRecords.map(async (record) => {
        const studentInfo = studentMap.get(record.studentId)
        const teacher = await ctx.db.get(record.teacherId)
        const teacherUser = teacher ? await ctx.db.get(teacher.userId) : null

        return {
          id: record._id,
          studentId: record.studentId,
          studentName: studentInfo?.fullName ?? 'Unknown student',
          sectionName: studentInfo?.sectionName ?? 'Unknown class',
          teacherName: teacherUser?.fullName ?? 'Unknown teacher',
          type: record.type,
          severityLevel: record.severityLevel,
          description: record.description,
          incidentDate: record.incidentDate,
          actionTaken: record.actionTaken ?? null,
        }
      })
    )

    return {
      term: { id: term._id, name: term.name, startDate: term.startDate, endDate: term.endDate },
      students,
      records: records.sort(
        (a, b) =>
          b.incidentDate.localeCompare(a.incidentDate) ||
          a.studentName.localeCompare(b.studentName)
      ),
    }
  },
})

/** Logs a merit or demerit incident for a student in the active term. */
export const logBehavior = mutation({
  args: {
    studentId: v.id('students'),
    teacherId: v.id('teachers'),
    type: v.union(v.literal('merit'), v.literal('demerit')),
    severityLevel: v.number(),
    description: v.string(),
    incidentDate: v.string(),
    actionTaken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'register.take')
    const term = await activeTerm(ctx)
    if (!term) throw new ConvexError({ code: 'noActiveTerm', message: 'No term is active.' })

    const result = await recordBehavior(convexBehaviorRepository(ctx.db), {
      studentId: asId(args.studentId),
      teacherId: asId(args.teacherId),
      termId: asId(term._id),
      type: args.type,
      severityLevel: args.severityLevel,
      description: args.description,
      incidentDate: args.incidentDate,
      actionTaken: args.actionTaken,
    })

    if (!result.ok) {
      throw new ConvexError({
        code: result.error.kind,
        message: describeBehaviorProblem(result.error),
      })
    }

    return result.value.id
  },
})
