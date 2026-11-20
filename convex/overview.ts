import { v } from 'convex/values'
import { query } from './_generated/server'
import { requireCapability } from './lib/access'
import { attendanceRate, change, weekOfTerm } from '../domain/overview/stats'
import { attentionItems, describeAttention, severityOf } from '../domain/overview/attention'
import { attendanceTrend as buildTrend, trendLabel } from '../domain/overview/trend'
import type { AttendanceStatus } from '../domain/attendance/ports'

/**
 * Figures for the Overview screen. Thin: the two calculations that are not a
 * plain count live in domain/overview/stats.ts.
 *
 * Every delta may be null. There is no baseline in a school's first year, and a
 * null delta means the UI omits the badge rather than inventing a comparison.
 */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, 'overview.view')
    const years = await ctx.db.query('academicYears').collect()
    const activeYear = years.find((year) => year.isActive)
    if (!activeYear) return null

    // "Previous" is the year immediately before the active one by name, which is
    // how academic years sort: "2025/2026" < "2026/2027".
    const previousYear = years
      .filter((year) => year._id !== activeYear._id && year.name < activeYear.name)
      .sort((a, b) => b.name.localeCompare(a.name))[0]

    const terms = await ctx.db
      .query('terms')
      .withIndex('by_academic_year', (q) => q.eq('academicYearId', activeYear._id))
      .collect()

    const today = new Date().toISOString().slice(0, 10)
    const currentTerm =
      terms.find((term) => term.startDate <= today && today <= term.endDate) ?? terms[0]

    // --- Enrolled students, this year against last ---------------------------
    const countEnrolled = async (academicYearId: typeof activeYear._id) =>
      (
        await ctx.db
          .query('studentEnrollments')
          .withIndex('by_year', (q) => q.eq('academicYearId', academicYearId))
          .collect()
      ).length

    const enrolledStudents = await countEnrolled(activeYear._id)
    const enrolledLastYear = previousYear ? await countEnrolled(previousYear._id) : null

    // --- Teaching staff, this term against last ------------------------------
    const countTeaching = async (termId: (typeof terms)[number]['_id']) => {
      const assignments = await ctx.db
        .query('teachingAssignments')
        .withIndex('by_term', (q) => q.eq('termId', termId))
        .collect()
      // Distinct: a teacher with four assignments is still one member of staff.
      return new Set(assignments.map((a) => a.teacherId)).size
    }

    const allTerms = await ctx.db.query('terms').collect()
    const previousTerm = allTerms
      .filter((term) => currentTerm && term.endDate < currentTerm.startDate)
      .sort((a, b) => b.endDate.localeCompare(a.endDate))[0]

    const teachingStaff = currentTerm ? await countTeaching(currentTerm._id) : 0
    const teachingStaffLastTerm = previousTerm ? await countTeaching(previousTerm._id) : null

    // --- Attendance, today against the last day a register was taken ---------
    const statusesOn = async (date: string) =>
      (
        await ctx.db
          .query('attendanceRecords')
          .withIndex('by_date', (q) => q.eq('attendanceDate', date))
          .collect()
      ).map((record) => record.status)

    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    const todayRate = attendanceRate(await statusesOn(today))
    const yesterdayRate = attendanceRate(await statusesOn(yesterday))

    return {
      academicYear: activeYear.name,
      term: currentTerm?.name ?? null,
      weekOfTerm: currentTerm
        ? weekOfTerm(currentTerm.startDate, currentTerm.endDate, today)
        : null,
      enrolledStudents: {
        value: enrolledStudents,
        delta: change(enrolledStudents, enrolledLastYear),
      },
      teachingStaff: {
        value: teachingStaff,
        delta: change(teachingStaff, teachingStaffLastTerm),
      },
      attendanceToday: {
        value: todayRate,
        delta: todayRate === null ? null : change(todayRate, yesterdayRate),
      },
    }
  },
})

/**
 * What needs a registrar's attention today (DESIGN.md 5.11).
 *
 * The decision about what qualifies lives in domain/overview/attention.ts. This
 * gathers the raw register state and hands back items already turned into
 * sentences, because the UI layer does not import the domain (docs/ARCHITECTURE.md).
 */
export const attention = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, 'overview.view')
    const activeYear = await ctx.db
      .query('academicYears')
      .filter((q) => q.eq(q.field('isActive'), true))
      .first()
    if (!activeYear) return []

    const today = new Date().toISOString().slice(0, 10)
    const sections = await ctx.db.query('classSections').collect()
    const sectionIds = new Map(sections.map((section) => [section.sectionName, section._id]))

    const registers = await Promise.all(
      sections.map(async (section) => {
        const enrolments = await ctx.db
          .query('studentEnrollments')
          .withIndex('by_class_year', (q) =>
            q.eq('classSectionId', section._id).eq('academicYearId', activeYear._id)
          )
          .collect()

        const records = await ctx.db
          .query('attendanceRecords')
          .withIndex('by_class_date', (q) =>
            q.eq('classSectionId', section._id).eq('attendanceDate', today)
          )
          .collect()

        return {
          sectionName: section.sectionName,
          enrolled: enrolments.length,
          statuses: records.map((record) => record.status),
        }
      })
    )

    return attentionItems(registers).map((item, index) => ({
      // Stable within a render, and the list is small and re-sorted every time.
      id: `${item.kind}-${index}`,
      kind: item.kind,
      severity: severityOf(item),
      sectionId: 'sectionName' in item ? (sectionIds.get(item.sectionName) ?? null) : null,
      ...describeAttention(item),
    }))
  },
})

/**
 * Attendance rate per school day, for the chart card (DESIGN.md 5.10).
 *
 * Reads the register by date, which is what `by_date` exists for. Days with no
 * register are dropped by the domain rather than plotted as zero.
 */
export const attendanceTrend = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days = 14 }) => {
    await requireCapability(ctx, 'overview.view')
    const registers: { date: string; statuses: AttendanceStatus[] }[] = []

    for (let back = days - 1; back >= 0; back--) {
      const date = new Date()
      date.setUTCDate(date.getUTCDate() - back)
      const on = date.toISOString().slice(0, 10)

      const records = await ctx.db
        .query('attendanceRecords')
        .withIndex('by_date', (q) => q.eq('attendanceDate', on))
        .collect()

      registers.push({ date: on, statuses: records.map((record) => record.status) })
    }

    return buildTrend(registers).map((point) => ({
      ...point,
      label: trendLabel(point.date),
    }))
  },
})
