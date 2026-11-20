import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireCapability } from './lib/access'
import { activeTerm } from './lib/calendar'
import type { Doc } from './_generated/dataModel'
import { canEditRemarks, canViewStudentResults } from '../domain/access/policy'
import {
  attendanceTotals,
  calculateSubjectResult,
  calculateTermGpa,
} from '../domain/results/calculate'
import type { GradingBand } from '../domain/results/gradingScale'
import { convexResultsRepository } from './adapters/results'
import { asId } from '../domain/ids'
import {
  describePublishProblem,
  publishTermSummary,
  withdrawTermSummary,
  type PublishProblem,
} from '../domain/results/publishTermSummary'

function refuse(problem: PublishProblem): never {
  throw new ConvexError({
    code: problem.kind,
    message: describePublishProblem(problem),
    ...(problem.kind === 'incomplete' ? { missing: problem.missing } : {}),
  })
}

/**
 * Makes a report card visible to parents and students. Thin adapter - the gate
 * itself lives in domain/results.
 */
export const publish = mutation({
  args: { summaryId: v.id('termSummaries') },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'results.publish')
    const result = await publishTermSummary(
      convexResultsRepository(ctx.db),
      asId(args.summaryId)
    )
    if (!result.ok) refuse(result.error)
    return result.value.id
  },
})

/** Hides a published report card again. */
export const withdraw = mutation({
  args: { summaryId: v.id('termSummaries') },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'results.publish')
    const result = await withdrawTermSummary(
      convexResultsRepository(ctx.db),
      asId(args.summaryId)
    )
    if (!result.ok) refuse(result.error)
    return result.value.id
  },
})

const toBand = (row: Doc<'gradingScales'>): GradingBand => ({
  id: row._id as unknown as GradingBand['id'],
  name: row.name,
  letterGrade: row.letterGrade,
  minScore: row.minScore,
  maxScore: row.maxScore,
  gpaPoint: row.gpaPoint,
})

/** One class section's report cards for the active term. */
export const forClass = query({
  args: { classSectionId: v.optional(v.id('classSections')) },
  handler: async (ctx, { classSectionId }) => {
    const viewer = await requireCapability(ctx, 'results.view')
    const term = await activeTerm(ctx)
    if (!term) return null

    const allSections = await ctx.db.query('classSections').collect()
    const section = classSectionId
      ? await ctx.db.get(classSectionId)
      : [...allSections].sort((a, b) => a.sectionName.localeCompare(b.sectionName))[0]
    if (!section) return null

    const enrolments = await ctx.db
      .query('studentEnrollments')
      .withIndex('by_class_year', (q) =>
        q.eq('classSectionId', section._id).eq('academicYearId', term.academicYearId)
      )
      .collect()

    const rows = await Promise.all(
      enrolments.map(async (enrolment) => {
        const student = await ctx.db.get(enrolment.studentId)
        const user = student ? await ctx.db.get(student.userId) : null

        const summary = await ctx.db
          .query('termSummaries')
          .withIndex('unique_student_term', (q) =>
            q.eq('studentId', enrolment.studentId).eq('termId', term._id)
          )
          .first()

        const subjects = await ctx.db
          .query('termSubjectResults')
          .withIndex('unique_student_term_subject', (q) =>
            q.eq('studentId', enrolment.studentId).eq('termId', term._id)
          )
          .collect()

        return {
          studentId: enrolment.studentId,
          fullName: user?.fullName ?? 'Unknown student',
          summaryId: summary?._id ?? null,
          termGpa: summary?.termGpa ?? null,
          daysPresent: summary?.totalDaysPresent ?? null,
          daysAbsent: summary?.totalDaysAbsent ?? null,
          subjects: subjects.length,
          isPublished: summary?.isPublished ?? false,
        }
      })
    )

    const visibleRows = rows.filter((row) =>
      canViewStudentResults(viewer, {
        studentId: asId(row.studentId),
        isPublished: row.isPublished,
      })
    )

    return {
      section: { id: section._id, name: section.sectionName },
      term: { id: term._id, name: term.name },
      rows: visibleRows.sort((a, b) => a.fullName.localeCompare(b.fullName)),
    }
  },
})

/**
 * Works out one student's results for the term and freezes them.
 *
 * Every calculation lives in domain/results/calculate.ts; this gathers the rows
 * it needs and writes what comes back. A published report card is refused rather
 * than recalculated - numbers a parent has already read must not change under
 * them without the school withdrawing it first.
 */
export const calculate = mutation({
  args: { studentId: v.id('students') },
  handler: async (ctx, { studentId }) => {
    await requireCapability(ctx, 'results.calculate')
    const term = await activeTerm(ctx)
    if (!term) throw new ConvexError({ code: 'noActiveTerm', message: 'No term is active.' })

    const existing = await ctx.db
      .query('termSummaries')
      .withIndex('unique_student_term', (q) => q.eq('studentId', studentId).eq('termId', term._id))
      .first()

    if (existing?.isPublished) {
      throw new ConvexError({
        code: 'alreadyPublished',
        message: 'Withdraw this report card before recalculating it.',
      })
    }

    const student = await ctx.db.get(studentId)
    const sectionId = student?.currentClassSectionId
    if (!student || !sectionId) {
      throw new ConvexError({ code: 'notEnrolled', message: 'That student is not in a class.' })
    }

    const bands = (await ctx.db.query('gradingScales').collect()).map(toBand)

    // The subjects a student takes are the ones taught to their section plus any
    // term-level elective/specialist enrolments in studentSubjectEnrollments.
    const classAssignments = await ctx.db
      .query('teachingAssignments')
      .withIndex('by_class_term', (q) => q.eq('classSectionId', sectionId).eq('termId', term._id))
      .collect()

    const subjectEnrollments = await ctx.db
      .query('studentSubjectEnrollments')
      .withIndex('by_student_term', (q) => q.eq('studentId', studentId).eq('termId', term._id))
      .collect()

    const assignments = [...classAssignments]
    if (subjectEnrollments.length > 0) {
      const coveredSubjects = new Set(assignments.map((a) => a.subjectId))
      const enrolledSubjectIds = new Set(subjectEnrollments.map((e) => e.subjectId))
      const termAssignments = await ctx.db
        .query('teachingAssignments')
        .withIndex('by_term', (q) => q.eq('termId', term._id))
        .collect()

      for (const subjectId of enrolledSubjectIds) {
        if (coveredSubjects.has(subjectId)) continue
        const match =
          termAssignments.find(
            (a) => a.subjectId === subjectId && a.classSectionId === undefined
          ) ?? termAssignments.find((a) => a.subjectId === subjectId)
        if (match) {
          assignments.push(match)
          coveredSubjects.add(subjectId)
        }
      }
    }

    const gpaPoints: number[] = []
    let written = 0
    const skipped: string[] = []

    for (const assignment of assignments) {
      const assessments = await ctx.db
        .query('assessments')
        .withIndex('by_assignment', (q) => q.eq('assignmentId', assignment._id))
        .collect()

      const weighted = await Promise.all(
        assessments.map(async (assessment) => {
          const mark = await ctx.db
            .query('studentMarks')
            .withIndex('unique_student_assessment', (q) =>
              q.eq('studentId', studentId).eq('assessmentId', assessment._id)
            )
            .first()

          return {
            weight: assessment.weight,
            maxScore: assessment.maxScore,
            score: mark?.score,
            // No mark entered at all is not the same as sitting and failing.
            status: mark?.status ?? ('incomplete' as const),
          }
        })
      )

      const calculated = calculateSubjectResult(weighted, bands)
      if (!calculated.ok) {
        skipped.push(calculated.error.kind)
        continue
      }

      const existingResult = await ctx.db
        .query('termSubjectResults')
        .withIndex('unique_student_term_subject', (q) =>
          q.eq('studentId', studentId).eq('termId', term._id).eq('subjectId', assignment.subjectId)
        )
        .first()

      const fields = {
        studentId,
        termId: term._id,
        subjectId: assignment.subjectId,
        teacherId: assignment.teacherId,
        cumulativeScore: calculated.value.cumulativeScore,
        letterGrade: calculated.value.letterGrade,
      }

      if (existingResult) await ctx.db.patch(existingResult._id, fields)
      else await ctx.db.insert('termSubjectResults', fields)

      gpaPoints.push(calculated.value.gpaPoint)
      written++
    }

    const register = await ctx.db
      .query('attendanceRecords')
      .withIndex('by_student_term', (q) => q.eq('studentId', studentId).eq('termId', term._id))
      .collect()
    const totals = attendanceTotals(register.map((record) => record.status))

    const summaryFields = {
      studentId,
      termId: term._id,
      classSectionId: sectionId,
      totalDaysPresent: totals.present,
      totalDaysAbsent: totals.absent,
      termGpa: calculateTermGpa(gpaPoints) ?? undefined,
      isPublished: false,
    }

    const summaryId = existing
      ? (await ctx.db.patch(existing._id, summaryFields), existing._id)
      : await ctx.db.insert('termSummaries', summaryFields)

    return { summaryId, subjects: written, skipped: skipped.length }
  },
})

/** One student's full report card (header + subject line items) for the active term. */
export const reportCard = query({
  args: { studentId: v.id('students') },
  handler: async (ctx, { studentId }) => {
    const viewer = await requireCapability(ctx, 'results.view')
    const term = await activeTerm(ctx)
    if (!term) return null

    const summary = await ctx.db
      .query('termSummaries')
      .withIndex('unique_student_term', (q) => q.eq('studentId', studentId).eq('termId', term._id))
      .first()

    if (
      !canViewStudentResults(viewer, {
        studentId: asId(studentId),
        isPublished: summary?.isPublished ?? false,
      })
    ) {
      return null
    }

    const student = await ctx.db.get(studentId)
    if (!student) return null

    const sectionId = summary?.classSectionId ?? student.currentClassSectionId

    const [section, studentUser, subjectRows] = await Promise.all([
      sectionId ? ctx.db.get(sectionId) : null,
      ctx.db.get(student.userId),
      ctx.db
        .query('termSubjectResults')
        .withIndex('unique_student_term_subject', (q) =>
          q.eq('studentId', studentId).eq('termId', term._id)
        )
        .collect(),
    ])

    const subjects = await Promise.all(
      subjectRows.map(async (row) => {
        const [subject, teacher] = await Promise.all([
          ctx.db.get(row.subjectId),
          ctx.db.get(row.teacherId),
        ])
        const teacherUser = teacher ? await ctx.db.get(teacher.userId) : null

        return {
          resultId: row._id,
          subjectName: subject?.name ?? 'Unknown subject',
          subjectCode: subject?.code ?? '',
          teacherName: teacherUser?.fullName ?? 'Unknown teacher',
          cumulativeScore: row.cumulativeScore,
          letterGrade: row.letterGrade,
          teacherRemark: row.teacherRemark ?? null,
        }
      })
    )

    return {
      summaryId: summary?._id ?? null,
      studentId,
      studentName: studentUser?.fullName ?? 'Unknown student',
      sectionName: section?.sectionName ?? 'Unknown class',
      termName: term.name,
      isPublished: summary?.isPublished ?? false,
      termGpa: summary?.termGpa ?? null,
      daysPresent: summary?.totalDaysPresent ?? null,
      daysAbsent: summary?.totalDaysAbsent ?? null,
      formTeacherRemark: summary?.formTeacherRemark ?? null,
      principalRemark: summary?.principalRemark ?? null,
      permissions: canEditRemarks(viewer.role),
      subjects: subjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
    }
  },
})

function cleanRemark(raw?: string): string | undefined {
  const trimmed = raw?.trim()
  return trimmed === '' ? undefined : trimmed
}

/** Saves teacher, form teacher and principal remarks on an unpublished report card. */
export const saveRemarks = mutation({
  args: {
    studentId: v.id('students'),
    formTeacherRemark: v.optional(v.string()),
    principalRemark: v.optional(v.string()),
    subjectRemarks: v.array(
      v.object({
        resultId: v.id('termSubjectResults'),
        teacherRemark: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const viewer = await requireCapability(ctx, 'marks.record')
    const permissions = canEditRemarks(viewer.role)

    const term = await activeTerm(ctx)
    if (!term) {
      throw new ConvexError({ code: 'noActiveTerm', message: 'No term is active.' })
    }

    const summary = await ctx.db
      .query('termSummaries')
      .withIndex('unique_student_term', (q) =>
        q.eq('studentId', args.studentId).eq('termId', term._id)
      )
      .first()

    if (summary?.isPublished) {
      throw new ConvexError({
        code: 'alreadyPublished',
        message: 'Withdraw this report card before changing its remarks.',
      })
    }

    if (args.principalRemark !== undefined && !permissions.principal) {
      throw new ConvexError({
        code: 'forbidden',
        message: 'Only an administrator can change the principal remark.',
      })
    }

    let summaryId = summary?._id
    if (summary) {
      await ctx.db.patch(summary._id, {
        formTeacherRemark: cleanRemark(args.formTeacherRemark),
        ...(permissions.principal && args.principalRemark !== undefined
          ? { principalRemark: cleanRemark(args.principalRemark) }
          : {}),
      })
    } else {
      const student = await ctx.db.get(args.studentId)
      if (!student?.currentClassSectionId) {
        throw new ConvexError({ code: 'notEnrolled', message: 'That student is not in a class.' })
      }
      summaryId = await ctx.db.insert('termSummaries', {
        studentId: args.studentId,
        termId: term._id,
        classSectionId: student.currentClassSectionId,
        isPublished: false,
        formTeacherRemark: cleanRemark(args.formTeacherRemark),
        ...(permissions.principal && args.principalRemark !== undefined
          ? { principalRemark: cleanRemark(args.principalRemark) }
          : {}),
      })
    }

    for (const item of args.subjectRemarks) {
      const row = await ctx.db.get(item.resultId)
      if (row && row.studentId === args.studentId && row.termId === term._id) {
        await ctx.db.patch(row._id, {
          teacherRemark: cleanRemark(item.teacherRemark),
        })
      }
    }

    return summaryId!
  },
})
