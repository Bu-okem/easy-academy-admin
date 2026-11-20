import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireCapability } from './lib/access'
import { activeTerm } from './lib/calendar'
import {
  ensureFormTeacherSubject,
  FORM_TEACHER_SUBJECT_CODE,
  getFormTeacherForSection,
} from './lib/formTeacher'
import { convexAcademicsRepository } from './adapters/academics'
import { asId } from '../domain/ids'
import {
  activateAcademicYear,
  addAcademicYear,
  describeYearProblem,
} from '../domain/academics/academicYear'
import { addTerm, describeTermProblem } from '../domain/academics/term'
import { addSubject, describeSubjectProblem } from '../domain/academics/subject'
import {
  addClassSection,
  addClassroom,
  addGradeLevel,
  addGradingBand,
  addPeriod,
  describeStructureProblem,
} from '../domain/academics/structure'
import {
  describeScheduleProblem,
  generateBellSchedule as buildBellSchedule,
  generateBellScheduleByBreakTimes as buildTimedBellSchedule,
  validatePeriodUpdate,
  type GeneratedPeriod,
} from '../domain/academics/schedule'
import { uncoveredScores } from '../domain/results/gradingScale'

/** Years with their terms, structure (grades, sections, rooms, periods), subjects and grading bands. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, 'academics.manage')
    const [years, subjects, grades, sections, classrooms, periods, gradingRows] = await Promise.all([
      ctx.db.query('academicYears').collect(),
      ctx.db.query('subjects').collect(),
      ctx.db.query('gradeLevels').collect(),
      ctx.db.query('classSections').collect(),
      ctx.db.query('classrooms').collect(),
      ctx.db.query('periods').collect(),
      ctx.db.query('gradingScales').collect(),
    ])

    const withTerms = await Promise.all(
      years.map(async (year) => {
        const terms = await ctx.db
          .query('terms')
          .withIndex('by_academic_year', (q) => q.eq('academicYearId', year._id))
          .collect()

        return {
          id: year._id,
          name: year.name,
          isActive: year.isActive,
          terms: terms
            .map((term) => ({
              id: term._id,
              name: term.name,
              startDate: term.startDate,
              endDate: term.endDate,
            }))
            .sort((a, b) => a.startDate.localeCompare(b.startDate)),
        }
      })
    )

    const term = await activeTerm(ctx)
    const gradeLevels = await Promise.all(
      [...grades]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(async (grade) => {
          const gradeSections = sections
            .filter((section) => section.gradeLevelId === grade._id)
            .sort((a, b) => a.sectionName.localeCompare(b.sectionName))

          return {
            id: grade._id,
            name: grade.name,
            sections: await Promise.all(
              gradeSections.map(async (section) => ({
                id: section._id,
                name: section.sectionName,
                formTeacher: term
                  ? await getFormTeacherForSection(ctx.db, section._id, term._id)
                  : null,
              }))
            ),
          }
        })
    )

    const bands = gradingRows.map((row) => ({
      id: asId<'gradingScales'>(row._id),
      name: row.name,
      letterGrade: row.letterGrade,
      minScore: row.minScore,
      maxScore: row.maxScore,
      gpaPoint: row.gpaPoint,
    }))

    return {
      years: withTerms.sort((a, b) => b.name.localeCompare(a.name)),
      subjects: subjects
        .filter((subject) => subject.code !== FORM_TEACHER_SUBJECT_CODE)
        .map((subject) => ({ id: subject._id, name: subject.name, code: subject.code }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      gradeLevels,
      classrooms: classrooms
        .map((room) => ({
          id: room._id,
          name: room.name,
          buildingName: room.buildingName ?? null,
          capacity: room.capacity ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      periods: periods
        .map((period) => ({
          id: period._id,
          name: period.name,
          startTime: period.startTime,
          endTime: period.endTime,
          isBreak: period.isBreak,
        }))
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      gradingScales: [...gradingRows]
        .sort((a, b) => b.minScore - a.minScore)
        .map((row) => ({
          id: row._id,
          name: row.name,
          letterGrade: row.letterGrade,
          minScore: row.minScore,
          maxScore: row.maxScore,
          gpaPoint: row.gpaPoint,
        })),
      uncoveredScores: uncoveredScores(bands),
    }
  },
})

export const createYear = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    await requireCapability(ctx, 'academics.manage')
    const result = await addAcademicYear(convexAcademicsRepository(ctx.db), name)
    if (!result.ok) {
      throw new ConvexError({ code: result.error.kind, message: describeYearProblem(result.error) })
    }
    return result.value
  },
})

export const activateYear = mutation({
  args: { yearId: v.id('academicYears') },
  handler: async (ctx, { yearId }) => {
    await requireCapability(ctx, 'academics.manage')
    const result = await activateAcademicYear(convexAcademicsRepository(ctx.db), asId(yearId))
    if (!result.ok) {
      throw new ConvexError({ code: result.error.kind, message: describeYearProblem(result.error) })
    }
    return result.value.id
  },
})

export const createTerm = mutation({
  args: {
    academicYearId: v.id('academicYears'),
    name: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'academics.manage')
    const result = await addTerm(convexAcademicsRepository(ctx.db), {
      academicYearId: asId(args.academicYearId),
      name: args.name,
      startDate: args.startDate,
      endDate: args.endDate,
    })
    if (!result.ok) {
      throw new ConvexError({ code: result.error.kind, message: describeTermProblem(result.error) })
    }
    return result.value
  },
})

export const createSubject = mutation({
  args: { name: v.string(), code: v.string() },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'academics.manage')
    const result = await addSubject(convexAcademicsRepository(ctx.db), args)
    if (!result.ok) {
      throw new ConvexError({
        code: result.error.kind,
        message: describeSubjectProblem(result.error),
      })
    }
    return result.value
  },
})

export const createGradeLevel = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    await requireCapability(ctx, 'academics.manage')
    const result = await addGradeLevel(convexAcademicsRepository(ctx.db), name)
    if (!result.ok) {
      throw new ConvexError({
        code: result.error.kind,
        message: describeStructureProblem(result.error),
      })
    }
    return result.value
  },
})

export const createClassSection = mutation({
  args: { gradeLevelId: v.id('gradeLevels'), sectionName: v.string() },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'academics.manage')
    const result = await addClassSection(convexAcademicsRepository(ctx.db), {
      gradeLevelId: asId(args.gradeLevelId),
      sectionName: args.sectionName,
    })
    if (!result.ok) {
      throw new ConvexError({
        code: result.error.kind,
        message: describeStructureProblem(result.error),
      })
    }
    return result.value
  },
})

export const createClassroom = mutation({
  args: {
    name: v.string(),
    buildingName: v.optional(v.string()),
    capacity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'academics.manage')
    const result = await addClassroom(convexAcademicsRepository(ctx.db), args)
    if (!result.ok) {
      throw new ConvexError({
        code: result.error.kind,
        message: describeStructureProblem(result.error),
      })
    }
    return result.value
  },
})

export const createPeriod = mutation({
  args: {
    name: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    isBreak: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'academics.manage')
    const result = await addPeriod(convexAcademicsRepository(ctx.db), args)
    if (!result.ok) {
      throw new ConvexError({
        code: result.error.kind,
        message: describeStructureProblem(result.error),
      })
    }
    return result.value
  },
})

export const createGradingBand = mutation({
  args: {
    name: v.string(),
    letterGrade: v.string(),
    minScore: v.number(),
    maxScore: v.number(),
    gpaPoint: v.number(),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'academics.manage')
    const result = await addGradingBand(convexAcademicsRepository(ctx.db), args)
    if (!result.ok) {
      throw new ConvexError({
        code: result.error.kind,
        message: describeStructureProblem(result.error),
      })
    }
    return result.value
  },
})

export const deleteGradingBand = mutation({
  args: {
    gradingScaleId: v.id('gradingScales'),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'academics.manage')
    const existing = await ctx.db.get(args.gradingScaleId)
    if (!existing) {
      throw new ConvexError({ code: 'notFound', message: 'Grading band not found.' })
    }
    await ctx.db.delete(args.gradingScaleId)
    return { deleted: true }
  },
})

export const updatePeriod = mutation({
  args: {
    periodId: v.id('periods'),
    name: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    isBreak: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'academics.manage')
    const target = await ctx.db.get(args.periodId)
    if (!target) {
      throw new ConvexError({ code: 'notFound', message: 'Period not found.' })
    }

    const repo = convexAcademicsRepository(ctx.db)
    const existing = await repo.listPeriods()
    const result = validatePeriodUpdate(existing, args.periodId, args)
    if (!result.ok) {
      throw new ConvexError({
        code: result.error.kind,
        message: describeScheduleProblem(result.error),
      })
    }

    await ctx.db.patch(args.periodId, result.value)
    return { updated: true }
  },
})

export const deletePeriod = mutation({
  args: {
    periodId: v.id('periods'),
    clearPlacedSlots: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'academics.manage')
    const target = await ctx.db.get(args.periodId)
    if (!target) {
      throw new ConvexError({ code: 'notFound', message: 'Period not found.' })
    }

    const allSlots = await ctx.db.query('timetableSlots').collect()
    const referencing = allSlots.filter((slot) => slot.periodId === args.periodId)

    if (referencing.length > 0 && !args.clearPlacedSlots) {
      throw new ConvexError({
        code: 'periodInUse',
        message: `${referencing.length} placed lesson(s) use "${target.name}". Confirm to clear those lessons and remove the period.`,
      })
    }

    for (const slot of referencing) {
      await ctx.db.delete(slot._id)
    }
    await ctx.db.delete(args.periodId)
    return { deleted: true, clearedSlots: referencing.length }
  },
})

async function replaceBellSchedulePeriods(
  ctx: { db: any },
  periods: GeneratedPeriod[],
  clearExistingSlots?: boolean
) {
  const [existingSlots, existingPeriods] = await Promise.all([
    ctx.db.query('timetableSlots').collect(),
    ctx.db.query('periods').collect(),
  ])

  if (existingSlots.length > 0 && !clearExistingSlots) {
    throw new ConvexError({
      code: 'scheduleInUse',
      message: `${existingSlots.length} placed lesson(s) exist on the timetable. Confirm to clear existing lessons and rebuild the bell schedule.`,
    })
  }

  for (const slot of existingSlots) {
    await ctx.db.delete(slot._id)
  }
  for (const period of existingPeriods) {
    await ctx.db.delete(period._id)
  }
  for (const period of periods) {
    await ctx.db.insert('periods', period)
  }

  return { createdCount: periods.length, clearedSlots: existingSlots.length }
}

export const generateBellSchedule = mutation({
  args: {
    startTime: v.string(),
    lessonCount: v.number(),
    lessonDurationMinutes: v.number(),
    passingMinutes: v.optional(v.number()),
    breaks: v.array(
      v.object({
        afterLesson: v.number(),
        name: v.string(),
        durationMinutes: v.number(),
      })
    ),
    clearExistingSlots: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'academics.manage')
    const result = buildBellSchedule({
      startTime: args.startTime,
      lessonCount: args.lessonCount,
      lessonDurationMinutes: args.lessonDurationMinutes,
      passingMinutes: args.passingMinutes,
      breaks: args.breaks,
    })
    if (!result.ok) {
      throw new ConvexError({
        code: result.error.kind,
        message: describeScheduleProblem(result.error),
      })
    }

    return await replaceBellSchedulePeriods(ctx, result.value, args.clearExistingSlots)
  },
})

export const generateBellScheduleByBreakTimes = mutation({
  args: {
    startTime: v.string(),
    lessonCount: v.number(),
    lessonDurationMinutes: v.number(),
    passingMinutes: v.optional(v.number()),
    breaks: v.array(
      v.object({
        name: v.string(),
        startTime: v.string(),
        durationMinutes: v.number(),
      })
    ),
    clearExistingSlots: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'academics.manage')
    const result = buildTimedBellSchedule({
      startTime: args.startTime,
      lessonCount: args.lessonCount,
      lessonDurationMinutes: args.lessonDurationMinutes,
      passingMinutes: args.passingMinutes,
      breaks: args.breaks,
    })
    if (!result.ok) {
      throw new ConvexError({
        code: result.error.kind,
        message: describeScheduleProblem(result.error),
      })
    }

    return await replaceBellSchedulePeriods(ctx, result.value, args.clearExistingSlots)
  },
})

export const setFormTeacher = mutation({
  args: {
    classSectionId: v.id('classSections'),
    teacherId: v.union(v.id('teachers'), v.null()),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'academics.manage')
    const term = await activeTerm(ctx)
    if (!term) {
      throw new ConvexError({ code: 'noActiveTerm', message: 'No active term is available.' })
    }

    const section = await ctx.db.get(args.classSectionId)
    if (!section) {
      throw new ConvexError({ code: 'notFound', message: 'Class section not found.' })
    }

    if (args.teacherId !== null) {
      const teacher = await ctx.db.get(args.teacherId)
      if (!teacher) {
        throw new ConvexError({ code: 'notFound', message: 'Teacher not found.' })
      }
    }

    const formSubjectId = await ensureFormTeacherSubject(ctx.db)
    const existing = await ctx.db
      .query('teachingAssignments')
      .withIndex('by_class_term', (q) =>
        q.eq('classSectionId', args.classSectionId).eq('termId', term._id)
      )
      .collect()

    for (const row of existing) {
      if (row.subjectId === formSubjectId) {
        await ctx.db.delete(row._id)
      }
    }

    if (args.teacherId !== null) {
      await ctx.db.insert('teachingAssignments', {
        teacherId: args.teacherId,
        subjectId: formSubjectId,
        classSectionId: args.classSectionId,
        termId: term._id,
      })
    }

    return { updated: true }
  },
})
