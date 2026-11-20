import { v } from 'convex/values'
import { query } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { requireCapability } from './lib/access'
import { activeYearAndTerm } from './lib/calendar'
import { toConvexId } from './adapters/ids'
import { canViewStudentResults } from '../domain/access/policy'
import { attendanceRate } from '../domain/overview/stats'
import { asId } from '../domain/ids'

const DAY_ORDER: Record<Doc<'timetableSlots'>['dayOfWeek'], number> = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
}

/**
 * Portal payload for families (`parent`) and `student` accounts.
 *
 * Returns only the student(s) the caller is permitted to see, and enforces
 * `canViewStudentResults` so unpublished draft report cards stay hidden.
 */
export const overview = query({
  args: { studentId: v.optional(v.id('students')) },
  handler: async (ctx, args) => {
    const viewer = await requireCapability(ctx, 'portal.view')
    const calendar = await activeYearAndTerm(ctx)
    const currentTerm = calendar?.currentTerm ?? null

    let allowedIds: Id<'students'>[] = []
    if (viewer.role === 'student') {
      allowedIds = viewer.studentId ? [toConvexId<'students'>(viewer.studentId)] : []
    } else if (viewer.role === 'parent') {
      allowedIds = (viewer.children ?? []).map((id) => toConvexId<'students'>(id))
    } else if (args.studentId) {
      allowedIds = [args.studentId]
    } else {
      const first = await ctx.db.query('students').first()
      allowedIds = first ? [first._id] : []
    }

    const hydratedList = (
      await Promise.all(
        allowedIds.map(async (studentId) => {
          const student = await ctx.db.get(studentId)
          if (!student) return null
          const [user, section] = await Promise.all([
            ctx.db.get(student.userId),
            student.currentClassSectionId ? ctx.db.get(student.currentClassSectionId) : null,
          ])
          return {
            id: student._id,
            fullName: user?.fullName ?? 'Unknown student',
            sectionName: section?.sectionName ?? null,
          }
        })
      )
    )
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.fullName.localeCompare(b.fullName))

    const selectedEntry =
      (args.studentId ? hydratedList.find((item) => item.id === args.studentId) : undefined) ??
      hydratedList[0] ??
      null

    if (!selectedEntry) {
      return {
        viewerRole: viewer.role,
        academicYear: calendar?.activeYear.name ?? null,
        termName: currentTerm?.name ?? null,
        students: [],
        selectedStudent: null,
      }
    }

    const student = await ctx.db.get(selectedEntry.id)
    if (!student) {
      return {
        viewerRole: viewer.role,
        academicYear: calendar?.activeYear.name ?? null,
        termName: currentTerm?.name ?? null,
        students: hydratedList,
        selectedStudent: null,
      }
    }

    const section = student.currentClassSectionId
      ? await ctx.db.get(student.currentClassSectionId)
      : null
    const gradeLevel = section ? await ctx.db.get(section.gradeLevelId) : null

    const [attendanceRows, behaviorRows, slotRows, summary] = currentTerm
      ? await Promise.all([
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
          student.currentClassSectionId
            ? ctx.db
                .query('timetableSlots')
                .withIndex('prevent_class_collision', (q) =>
                  q.eq('termId', currentTerm._id).eq('classSectionId', student.currentClassSectionId!)
                )
                .collect()
            : Promise.resolve([]),
          ctx.db
            .query('termSummaries')
            .withIndex('unique_student_term', (q) =>
              q.eq('studentId', student._id).eq('termId', currentTerm._id)
            )
            .first(),
        ])
      : [[], [], [], null]

    const attendanceCounts = { present: 0, late: 0, absent: 0, excused: 0 }
    for (const record of attendanceRows) attendanceCounts[record.status]++

    const recentAttendance = [...attendanceRows]
      .sort((a, b) => b.attendanceDate.localeCompare(a.attendanceDate))
      .slice(0, 8)
      .map((record) => ({
        id: record._id,
        attendanceDate: record.attendanceDate,
        status: record.status,
        remarks: record.remarks ?? null,
      }))

    const behaviorItems = (
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

    const behaviorCounts = {
      merits: behaviorItems.filter((item) => item.type === 'merit').length,
      demerits: behaviorItems.filter((item) => item.type === 'demerit').length,
    }

    const timetable = (
      await Promise.all(
        slotRows.map(async (slot) => {
          const [subject, teacher, classroom, period] = await Promise.all([
            ctx.db.get(slot.subjectId),
            ctx.db.get(slot.teacherId),
            ctx.db.get(slot.classroomId),
            ctx.db.get(slot.periodId),
          ])
          const teacherUser = teacher ? await ctx.db.get(teacher.userId) : null
          return {
            id: slot._id,
            dayOfWeek: slot.dayOfWeek,
            periodName: period?.name ?? 'Period',
            startTime: period?.startTime ?? '',
            endTime: period?.endTime ?? '',
            subjectName: subject?.name ?? 'Unknown subject',
            teacherName: teacherUser?.fullName ?? 'Unknown teacher',
            classroomName: classroom?.name ?? 'Unknown room',
          }
        })
      )
    ).sort(
      (a, b) =>
        DAY_ORDER[a.dayOfWeek] - DAY_ORDER[b.dayOfWeek] ||
        a.startTime.localeCompare(b.startTime)
    )

    let reportCard: {
      termGpa: number | null
      daysPresent: number | null
      daysAbsent: number | null
      formTeacherRemark: string | null
      principalRemark: string | null
      subjects: {
        id: Id<'termSubjectResults'>
        subjectName: string
        subjectCode: string
        teacherName: string
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

      const subjects = await Promise.all(
        subjectRows.map(async (row) => {
          const [subject, teacher] = await Promise.all([
            ctx.db.get(row.subjectId),
            ctx.db.get(row.teacherId),
          ])
          const teacherUser = teacher ? await ctx.db.get(teacher.userId) : null
          return {
            id: row._id,
            subjectName: subject?.name ?? 'Unknown subject',
            subjectCode: subject?.code ?? '',
            teacherName: teacherUser?.fullName ?? 'Unknown teacher',
            cumulativeScore: row.cumulativeScore,
            letterGrade: row.letterGrade,
            teacherRemark: row.teacherRemark ?? null,
          }
        })
      )

      reportCard = {
        termGpa: summary.termGpa ?? null,
        daysPresent: summary.totalDaysPresent ?? null,
        daysAbsent: summary.totalDaysAbsent ?? null,
        formTeacherRemark: summary.formTeacherRemark ?? null,
        principalRemark: summary.principalRemark ?? null,
        subjects: subjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
      }
    }

    return {
      viewerRole: viewer.role,
      academicYear: calendar?.activeYear.name ?? null,
      termName: currentTerm?.name ?? null,
      students: hydratedList,
      selectedStudent: {
        id: student._id,
        fullName: selectedEntry.fullName,
        dateOfBirth: student.dateOfBirth,
        sectionName: section?.sectionName ?? null,
        gradeName: gradeLevel?.name ?? null,
        attendance: {
          rate: attendanceRate(attendanceRows.map((record) => record.status)),
          counts: attendanceCounts,
          recent: recentAttendance,
        },
        behavior: {
          counts: behaviorCounts,
          items: behaviorItems,
        },
        timetable,
        reportCard,
      },
    }
  },
})
