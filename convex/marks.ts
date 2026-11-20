import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireCapability } from './lib/access'
import { activeTerm } from './lib/calendar'
import { convexMarksRepository } from './adapters/marks'
import { asId } from '../domain/ids'
import { addAssessment, describeAssessmentProblem } from '../domain/marks/addAssessment'
import { describeMarkProblem, recordMark } from '../domain/marks/recordMark'

const markStatus = v.union(
  v.literal('present'),
  v.literal('absent'),
  v.literal('excused'),
  v.literal('incomplete')
)

/**
 * Mark entry sheet for the active term: teaching assignments, the chosen
 * assignment's assessments, and every student enrolled in that class.
 */
export const sheet = query({
  args: {
    assignmentId: v.optional(v.id('teachingAssignments')),
    assessmentId: v.optional(v.id('assessments')),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'marks.record')
    const term = await activeTerm(ctx)
    if (!term) return null

    const termAssignments = await ctx.db
      .query('teachingAssignments')
      .withIndex('by_term', (q) => q.eq('termId', term._id))
      .collect()

    const classAssignments = termAssignments.filter((a) => a.classSectionId !== undefined)

    const hydratedAssignments = await Promise.all(
      classAssignments.map(async (assignment) => {
        const [subject, section, teacher] = await Promise.all([
          ctx.db.get(assignment.subjectId),
          ctx.db.get(assignment.classSectionId!),
          ctx.db.get(assignment.teacherId),
        ])
        const teacherUser = teacher ? await ctx.db.get(teacher.userId) : null

        return {
          id: assignment._id,
          classSectionId: assignment.classSectionId!,
          subjectName: subject?.name ?? 'Unknown subject',
          sectionName: section?.sectionName ?? 'Unknown class',
          teacherName: teacherUser?.fullName ?? 'Unknown teacher',
        }
      })
    )

    const assignments = hydratedAssignments.sort(
      (a, b) =>
        a.sectionName.localeCompare(b.sectionName) || a.subjectName.localeCompare(b.subjectName)
    )

    const selectedAssignment =
      (args.assignmentId ? assignments.find((a) => a.id === args.assignmentId) : undefined) ??
      assignments[0] ??
      null

    if (!selectedAssignment) {
      return {
        term: { id: term._id, name: term.name },
        assignments: [],
        selectedAssignment: null,
        assessments: [],
        selectedAssessment: null,
        students: [],
      }
    }

    const assessments = (
      await ctx.db
        .query('assessments')
        .withIndex('by_assignment', (q) => q.eq('assignmentId', selectedAssignment.id))
        .collect()
    ).map((a) => ({
      id: a._id,
      name: a.name,
      weight: a.weight,
      maxScore: a.maxScore,
    }))

    const selectedAssessment =
      (args.assessmentId ? assessments.find((a) => a.id === args.assessmentId) : undefined) ??
      assessments[0] ??
      null

    const enrolments = await ctx.db
      .query('studentEnrollments')
      .withIndex('by_class_year', (q) =>
        q
          .eq('classSectionId', selectedAssignment.classSectionId)
          .eq('academicYearId', term.academicYearId)
      )
      .collect()

    const students = await Promise.all(
      enrolments.map(async (enrolment) => {
        const student = await ctx.db.get(enrolment.studentId)
        const user = student ? await ctx.db.get(student.userId) : null
        const mark = selectedAssessment
          ? await ctx.db
              .query('studentMarks')
              .withIndex('unique_student_assessment', (q) =>
                q.eq('studentId', enrolment.studentId).eq('assessmentId', selectedAssessment.id)
              )
              .first()
          : null

        return {
          studentId: enrolment.studentId,
          fullName: user?.fullName ?? 'Unknown student',
          score: mark?.score ?? null,
          status: mark?.status ?? null,
        }
      })
    )

    return {
      term: { id: term._id, name: term.name },
      assignments,
      selectedAssignment,
      assessments,
      selectedAssessment,
      students: students.sort((a, b) => a.fullName.localeCompare(b.fullName)),
    }
  },
})

/** Creates an assessment blueprint for a teaching assignment. */
export const createAssessment = mutation({
  args: {
    assignmentId: v.id('teachingAssignments'),
    name: v.string(),
    weightPercent: v.number(),
    maxScore: v.number(),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'marks.record')
    const result = await addAssessment(convexMarksRepository(ctx.db), {
      assignmentId: asId(args.assignmentId),
      name: args.name,
      weight: args.weightPercent / 100,
      maxScore: args.maxScore,
    })

    if (!result.ok) {
      throw new ConvexError({
        code: result.error.kind,
        message: describeAssessmentProblem(result.error),
      })
    }

    return result.value
  },
})

/**
 * Thin adapter: validate, build the repository, call the domain, translate the
 * result. No marking rule lives in this file - see domain/marks.
 */
export const record = mutation({
  args: {
    assessmentId: v.id('assessments'),
    studentId: v.id('students'),
    score: v.optional(v.number()),
    status: markStatus,
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'marks.record')
    const result = await recordMark(convexMarksRepository(ctx.db), {
      assessmentId: asId(args.assessmentId),
      studentId: asId(args.studentId),
      score: args.score,
      status: args.status,
    })

    if (!result.ok) {
      throw new ConvexError({
        code: result.error.kind,
        message: describeMarkProblem(result.error),
      })
    }

    return { outcome: result.value.outcome, markId: result.value.mark.id }
  },
})

/** Saves marks for a class in one atomic transaction. */
export const recordBatch = mutation({
  args: {
    assessmentId: v.id('assessments'),
    entries: v.array(
      v.object({
        studentId: v.id('students'),
        score: v.optional(v.number()),
        status: markStatus,
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'marks.record')
    const repo = convexMarksRepository(ctx.db)
    let recorded = 0
    let corrected = 0

    for (const entry of args.entries) {
      const result = await recordMark(repo, {
        assessmentId: asId(args.assessmentId),
        studentId: asId(entry.studentId),
        score: entry.score,
        status: entry.status,
      })

      if (!result.ok) {
        throw new ConvexError({
          code: result.error.kind,
          message: describeMarkProblem(result.error),
        })
      }

      if (result.value.outcome === 'recorded') recorded++
      else corrected++
    }

    return { recorded, corrected }
  },
})
