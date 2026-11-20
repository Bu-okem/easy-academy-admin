import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireCapability } from './lib/access'
import { activeTerm } from './lib/calendar'
import { FORM_TEACHER_SUBJECT_CODE } from './lib/formTeacher'
import { convexTimetableRepository } from './adapters/timetable'
import { toConvexId } from './adapters/ids'
import { asId } from '../domain/ids'
import { describeConflict, placeSlot } from '../domain/timetable/placeSlot'

const dayOfWeek = v.union(
  v.literal('Monday'),
  v.literal('Tuesday'),
  v.literal('Wednesday'),
  v.literal('Thursday'),
  v.literal('Friday'),
  v.literal('Saturday')
)

/** Every weekday the schema allows a lesson on. */
export const DAYS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const

export const sections = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, 'timetable.view')
    const sections = await ctx.db.query('classSections').collect()
    return sections
      .map((section) => ({ id: section._id, name: section.sectionName }))
      .sort((a, b) => a.name.localeCompare(b.name))
  },
})

/**
 * One class section's week: the period rows, and what sits in each cell.
 *
 * Breaks come back with the periods because the school day includes them; the
 * grid draws them as a band rather than a placeable cell.
 */
export const grid = query({
  args: { classSectionId: v.optional(v.id('classSections')) },
  handler: async (ctx, { classSectionId }) => {
    await requireCapability(ctx, 'timetable.view')
    const term = await activeTerm(ctx)
    if (!term) return null

    const allSections = await ctx.db.query('classSections').collect()
    const section = classSectionId
      ? await ctx.db.get(classSectionId)
      : [...allSections].sort((a, b) => a.sectionName.localeCompare(b.sectionName))[0]
    if (!section) return null

    const periods = (await ctx.db.query('periods').collect()).sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    )

    const slots = await ctx.db
      .query('timetableSlots')
      .withIndex('prevent_class_collision', (q) =>
        q.eq('termId', term._id).eq('classSectionId', section._id)
      )
      .collect()

    const placed = await Promise.all(
      slots.map(async (slot) => {
        const [subject, classroom, teacher] = await Promise.all([
          ctx.db.get(slot.subjectId),
          ctx.db.get(slot.classroomId),
          ctx.db.get(slot.teacherId),
        ])
        const teacherUser = teacher ? await ctx.db.get(teacher.userId) : null

        return {
          id: slot._id,
          dayOfWeek: slot.dayOfWeek,
          periodId: slot.periodId,
          subject: subject?.name ?? 'Unknown subject',
          classroom: classroom?.name ?? 'Unknown room',
          teacher: teacherUser?.fullName ?? 'Unknown teacher',
        }
      })
    )

    return {
      section: { id: section._id, name: section.sectionName },
      term: { id: term._id, name: term.name },
      periods: periods.map((period) => ({
        id: period._id,
        name: period.name,
        startTime: period.startTime,
        endTime: period.endTime,
        isBreak: period.isBreak,
      })),
      slots: placed,
    }
  },
})

/** What can be placed: this term's teaching assignments, and the rooms. */
export const placementOptions = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, 'timetable.view')
    const term = await activeTerm(ctx)
    if (!term) return { assignments: [], classrooms: [] }

    const assignments = await ctx.db
      .query('teachingAssignments')
      .withIndex('by_term', (q) => q.eq('termId', term._id))
      .collect()

    const described = (
      await Promise.all(
        assignments.map(async (assignment) => {
          const [subject, teacher] = await Promise.all([
            ctx.db.get(assignment.subjectId),
            ctx.db.get(assignment.teacherId),
          ])
          if (subject?.code === FORM_TEACHER_SUBJECT_CODE) return null
          const user = teacher ? await ctx.db.get(teacher.userId) : null

          return {
            id: assignment._id,
            label: `${subject?.name ?? 'Unknown subject'} — ${user?.fullName ?? 'Unknown teacher'}`,
          }
        })
      )
    ).filter((item): item is NonNullable<typeof item> => item !== null)

    const classrooms = await ctx.db.query('classrooms').collect()

    return {
      assignments: described.sort((a, b) => a.label.localeCompare(b.label)),
      classrooms: classrooms
        .map((room) => ({ id: room._id, label: room.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    }
  },
})

/**
 * Places one lesson on the timetable.
 *
 * Thin adapter: the teacher, subject and term are read from the teaching
 * assignment rather than accepted from the caller, so a client cannot submit a
 * teacher who does not teach that subject. The double-booking rule itself lives
 * in domain/timetable.
 */
export const place = mutation({
  args: {
    assignmentId: v.id('teachingAssignments'),
    classSectionId: v.id('classSections'),
    classroomId: v.id('classrooms'),
    dayOfWeek,
    periodId: v.id('periods'),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'timetable.manage')
    const assignment = await ctx.db.get(args.assignmentId)
    if (!assignment) {
      throw new ConvexError({ code: 'assignmentNotFound', message: 'That teaching assignment no longer exists.' })
    }

    const period = await ctx.db.get(args.periodId)
    if (period?.isBreak) {
      throw new ConvexError({ code: 'periodIsBreak', message: `${period.name} is a break, not a teaching period.` })
    }

    const result = await placeSlot(convexTimetableRepository(ctx.db), {
      termId: asId(assignment.termId),
      teachingAssignmentId: asId(assignment._id),
      teacherId: asId(assignment.teacherId),
      classSectionId: asId(args.classSectionId),
      subjectId: asId(assignment.subjectId),
      classroomId: asId(args.classroomId),
      dayOfWeek: args.dayOfWeek,
      periodId: asId(args.periodId),
    })

    if (!result.ok) {
      throw new ConvexError({
        code: result.error.kind,
        message: describeConflict(result.error),
        conflictingSlotId: result.error.conflictingSlot.id,
      })
    }

    return result.value.id
  },
})

/** Removes a lesson from the grid. */
export const remove = mutation({
  args: { slotId: v.id('timetableSlots') },
  handler: async (ctx, { slotId }) => {
    await requireCapability(ctx, 'timetable.manage')
    await ctx.db.delete(toConvexId<'timetableSlots'>(slotId))
  },
})
