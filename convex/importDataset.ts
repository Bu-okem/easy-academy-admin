import { v } from 'convex/values'
import { internalMutation } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { activeTerm } from './lib/calendar'
import { ensureFormTeacherSubject } from './lib/formTeacher'

const SCHOOL_TABLES = [
  'timetableSlots',
  'attendanceRecords',
  'behaviorRecords',
  'studentMarks',
  'assessments',
  'termSubjectResults',
  'termSummaries',
  'teachingAssignments',
  'studentSubjectEnrollments',
  'studentEnrollments',
  'parentStudentRelations',
  'students',
  'teachers',
  'staff',
  'periods',
  'classrooms',
  'classSections',
  'gradeLevels',
  'subjects',
  'gradingScales',
  'terms',
  'academicYears',
] as const

/** Clears school data in bounded batches while preserving admin user accounts. */
export const resetSchoolPreserveAdmins = internalMutation({
  args: {},
  handler: async (ctx) => {
    const BATCH_LIMIT = 400
    let deletedRows = 0

    for (const table of SCHOOL_TABLES) {
      const remaining = BATCH_LIMIT - deletedRows
      if (remaining <= 0) {
        return { done: false, deletedRows, preservedAdmins: 0 }
      }
      const rows = await ctx.db.query(table).take(remaining)
      for (const row of rows) {
        await ctx.db.delete(row._id)
        deletedRows++
      }
    }

    const users = await ctx.db.query('users').collect()
    let preservedAdmins = 0
    for (const user of users) {
      if (user.role === 'admin') {
        preservedAdmins++
      } else {
        if (deletedRows >= BATCH_LIMIT) {
          return { done: false, deletedRows, preservedAdmins }
        }
        await ctx.db.delete(user._id)
        deletedRows++
      }
    }

    return { done: true, deletedRows, preservedAdmins }
  },
})

/** Seeds academic year, terms, grades, sections, classrooms, subjects, periods, and grading scale. */
export const seedStructure = internalMutation({
  args: {
    academicSession: v.string(),
    levels: v.array(v.string()),
    classrooms: v.array(
      v.object({
        classroomId: v.string(),
        name: v.string(),
        roomType: v.string(),
        block: v.string(),
        level: v.optional(v.string()),
        capacity: v.number(),
      })
    ),
    subjects: v.array(v.object({ name: v.string(), code: v.string() })),
  },
  handler: async (ctx, args) => {
    const yearId = await ctx.db.insert('academicYears', {
      name: args.academicSession,
      isActive: true,
    })

    const termId = await ctx.db.insert('terms', {
      academicYearId: yearId,
      name: 'First Term',
      startDate: '2026-09-07',
      endDate: '2026-12-18',
    })
    await ctx.db.insert('terms', {
      academicYearId: yearId,
      name: 'Second Term',
      startDate: '2027-01-11',
      endDate: '2027-04-09',
    })
    await ctx.db.insert('terms', {
      academicYearId: yearId,
      name: 'Third Term',
      startDate: '2027-04-26',
      endDate: '2027-07-23',
    })

    const gradeIdByLevel: Record<string, Id<'gradeLevels'>> = {}
    for (const level of args.levels) {
      gradeIdByLevel[level] = await ctx.db.insert('gradeLevels', { name: level })
    }

    const sectionByClassroomId: Record<string, Id<'classSections'>> = {}
    const sectionIdsByLevel: Record<string, Id<'classSections'>[]> = {}

    for (const room of args.classrooms) {
      await ctx.db.insert('classrooms', {
        name: room.name,
        buildingName: room.block,
        capacity: room.capacity,
      })

      if (room.roomType === 'homeroom' && room.level) {
        const gradeLevelId = gradeIdByLevel[room.level]
        if (gradeLevelId) {
          const sectionId = await ctx.db.insert('classSections', {
            gradeLevelId,
            sectionName: room.name,
          })
          sectionByClassroomId[room.classroomId] = sectionId
          sectionIdsByLevel[room.level] ??= []
          sectionIdsByLevel[room.level]!.push(sectionId)
        }
      }
    }

    const subjectByName: Record<string, Id<'subjects'>> = {}
    for (const subject of args.subjects) {
      subjectByName[subject.name] = await ctx.db.insert('subjects', {
        name: subject.name,
        code: subject.code,
      })
    }

    const defaultPeriods = [
      { name: 'Period 1', startTime: '08:00', endTime: '08:40', isBreak: false },
      { name: 'Period 2', startTime: '08:40', endTime: '09:20', isBreak: false },
      { name: 'Period 3', startTime: '09:20', endTime: '10:00', isBreak: false },
      { name: 'Morning Break', startTime: '10:00', endTime: '10:20', isBreak: true },
      { name: 'Period 4', startTime: '10:20', endTime: '11:00', isBreak: false },
      { name: 'Period 5', startTime: '11:00', endTime: '11:40', isBreak: false },
      { name: 'Lunch Break', startTime: '11:40', endTime: '12:20', isBreak: true },
      { name: 'Period 6', startTime: '12:20', endTime: '13:00', isBreak: false },
    ]
    for (const period of defaultPeriods) {
      await ctx.db.insert('periods', period)
    }

    const gradingBands = [
      { name: 'WAEC', letterGrade: 'A', minScore: 75, maxScore: 100, gpaPoint: 4.0 },
      { name: 'WAEC', letterGrade: 'B', minScore: 65, maxScore: 74, gpaPoint: 3.3 },
      { name: 'WAEC', letterGrade: 'C', minScore: 50, maxScore: 64, gpaPoint: 2.5 },
      { name: 'WAEC', letterGrade: 'D', minScore: 40, maxScore: 49, gpaPoint: 1.5 },
      { name: 'WAEC', letterGrade: 'F', minScore: 0, maxScore: 39, gpaPoint: 0.0 },
    ]
    for (const band of gradingBands) {
      await ctx.db.insert('gradingScales', band)
    }

    return {
      yearId,
      termId,
      sectionByClassroomId,
      sectionIdsByLevel,
      subjectByName,
    }
  },
})

/** Seeds teachers (with teaching assignments), non-teaching staff, and guardians. */
export const seedFacultyAndGuardians = internalMutation({
  args: {
    termId: v.id('terms'),
    subjectByName: v.record(v.string(), v.id('subjects')),
    sectionIdsByLevel: v.record(v.string(), v.array(v.id('classSections'))),
    teachers: v.array(
      v.object({
        fullName: v.string(),
        email: v.string(),
        specialization: v.string(),
        subjectsTaught: v.array(v.string()),
        levelsTaught: v.array(v.string()),
      })
    ),
    staff: v.array(
      v.object({
        fullName: v.string(),
        email: v.string(),
        jobTitle: v.string(),
        department: v.string(),
      })
    ),
    guardians: v.array(
      v.object({
        guardianId: v.string(),
        fullName: v.string(),
        email: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let assignmentCount = 0

    for (const teacher of args.teachers) {
      const userId = await ctx.db.insert('users', {
        email: teacher.email.trim().toLowerCase(),
        fullName: teacher.fullName,
        role: 'teacher',
        passwordHash: 'managed-by-clerk',
      })
      const teacherId = await ctx.db.insert('teachers', {
        userId,
        specialization: teacher.specialization,
      })

      const targetSections: Id<'classSections'>[] = []
      for (const level of teacher.levelsTaught) {
        const sections = args.sectionIdsByLevel[level] ?? []
        targetSections.push(...sections)
      }

      for (const subjectName of teacher.subjectsTaught) {
        const subjectId = args.subjectByName[subjectName]
        if (!subjectId) continue
        if (targetSections.length === 0) {
          await ctx.db.insert('teachingAssignments', {
            teacherId,
            subjectId,
            termId: args.termId,
          })
          assignmentCount++
        } else {
          for (const classSectionId of targetSections) {
            await ctx.db.insert('teachingAssignments', {
              teacherId,
              subjectId,
              classSectionId,
              termId: args.termId,
            })
            assignmentCount++
          }
        }
      }
    }

    for (const member of args.staff) {
      const userId = await ctx.db.insert('users', {
        email: member.email.trim().toLowerCase(),
        fullName: member.fullName,
        role: 'staff',
        passwordHash: 'managed-by-clerk',
      })
      await ctx.db.insert('staff', {
        userId,
        jobTitle: member.jobTitle,
        department: member.department,
      })
    }

    const guardianUserByExternalId: Record<string, Id<'users'>> = {}
    for (const guardian of args.guardians) {
      guardianUserByExternalId[guardian.guardianId] = await ctx.db.insert('users', {
        email: guardian.email.trim().toLowerCase(),
        fullName: guardian.fullName,
        role: 'parent',
        passwordHash: 'managed-by-clerk',
      })
    }

    return {
      teachersInserted: args.teachers.length,
      staffInserted: args.staff.length,
      guardiansInserted: args.guardians.length,
      assignmentCount,
      guardianUserByExternalId,
    }
  },
})

/** Seeds a batch of students with enrollments, guardian links, and subject enrollments. */
export const seedStudentBatch = internalMutation({
  args: {
    yearId: v.id('academicYears'),
    termId: v.id('terms'),
    sectionByClassroomId: v.record(v.string(), v.id('classSections')),
    subjectByName: v.record(v.string(), v.id('subjects')),
    guardianUserByExternalId: v.record(v.string(), v.id('users')),
    students: v.array(
      v.object({
        fullName: v.string(),
        email: v.string(),
        dateOfBirth: v.string(),
        classroomId: v.string(),
        guardianId: v.string(),
        subjectsOffered: v.array(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    let subjectEnrollments = 0

    for (const item of args.students) {
      const classSectionId = args.sectionByClassroomId[item.classroomId]
      const userId = await ctx.db.insert('users', {
        email: item.email.trim().toLowerCase(),
        fullName: item.fullName,
        role: 'student',
        passwordHash: 'managed-by-clerk',
      })
      const studentId = await ctx.db.insert('students', {
        userId,
        dateOfBirth: item.dateOfBirth,
        currentClassSectionId: classSectionId,
      })

      if (classSectionId) {
        await ctx.db.insert('studentEnrollments', {
          studentId,
          classSectionId,
          academicYearId: args.yearId,
        })
      }

      const parentId = args.guardianUserByExternalId[item.guardianId]
      if (parentId) {
        await ctx.db.insert('parentStudentRelations', {
          parentId,
          studentId,
        })
      }

      for (const subjectName of item.subjectsOffered) {
        const subjectId = args.subjectByName[subjectName]
        if (!subjectId) continue
        await ctx.db.insert('studentSubjectEnrollments', {
          studentId,
          subjectId,
          termId: args.termId,
        })
        subjectEnrollments++
      }
    }

    return {
      studentsInserted: args.students.length,
      subjectEnrollments,
    }
  },
})

/** Assigns form teachers to class sections in the active term by section name and teacher email. */
export const seedFormTeachers = internalMutation({
  args: {
    assignments: v.array(
      v.object({
        sectionName: v.string(),
        teacherEmail: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const term = await activeTerm(ctx)
    if (!term) throw new Error('No active term found.')

    const formSubjectId = await ensureFormTeacherSubject(ctx.db)
    const sections = await ctx.db.query('classSections').collect()
    const sectionByName = new Map(sections.map((s) => [s.sectionName, s._id]))

    let linked = 0
    for (const item of args.assignments) {
      const classSectionId = sectionByName.get(item.sectionName)
      if (!classSectionId) continue

      const user = await ctx.db
        .query('users')
        .withIndex('by_email', (q) => q.eq('email', item.teacherEmail.trim().toLowerCase()))
        .first()
      if (!user) continue

      const teacher = await ctx.db
        .query('teachers')
        .withIndex('by_user', (q) => q.eq('userId', user._id))
        .first()
      if (!teacher) continue

      const existing = await ctx.db
        .query('teachingAssignments')
        .withIndex('by_class_term', (q) =>
          q.eq('classSectionId', classSectionId).eq('termId', term._id)
        )
        .collect()
      for (const row of existing) {
        if (row.subjectId === formSubjectId) await ctx.db.delete(row._id)
      }

      await ctx.db.insert('teachingAssignments', {
        teacherId: teacher._id,
        subjectId: formSubjectId,
        classSectionId,
        termId: term._id,
      })
      linked++
    }

    return { linked }
  },
})
