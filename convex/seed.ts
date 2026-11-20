import { v } from 'convex/values'
import { internalMutation } from './_generated/server'
import type { Doc, Id, TableNames } from './_generated/dataModel'
import { convexAttendanceRepository } from './adapters/attendance'
import { convexBehaviorRepository } from './adapters/behavior'
import { asId } from '../domain/ids'
import { recordAttendance } from '../domain/attendance/recordAttendance'
import { recordBehavior } from '../domain/behavior/recordBehavior'
import { placeSlot } from '../domain/timetable/placeSlot'
import { recordMark } from '../domain/marks/recordMark'
import { convexMarksRepository } from './adapters/marks'
import { convexTimetableRepository } from './adapters/timetable'
import { activeTerm } from './lib/calendar'
import type { AttendanceStatus } from '../domain/attendance/ports'

/**
 * Development fixtures. Internal, so it is never part of the public API.
 *
 *   npx convex run seed:run      populate an empty deployment
 *   npx convex run seed:clear    empty every table
 *
 * Tables with no domain rules are written directly - there is no invariant to
 * bypass. Attendance goes through `recordAttendance` like any other caller,
 * because a rule exists for it and seeds are not exempt from the rules
 * (docs/ARCHITECTURE.md).
 */

const TABLES: TableNames[] = [
  'attendanceRecords', 'behaviorRecords', 'studentMarks', 'assessments',
  'timetableSlots', 'teachingAssignments', 'studentSubjectEnrollments',
  'studentEnrollments', 'termSubjectResults', 'termSummaries',
  'parentStudentRelations', 'students', 'teachers', 'staff', 'users',
  'classSections', 'gradeLevels', 'subjects', 'classrooms', 'periods',
  'terms', 'academicYears', 'gradingScales',
]

export const clear = internalMutation({
  args: {},
  handler: async (ctx) => {
    let deleted = 0
    for (const table of TABLES) {
      const rows = await ctx.db.query(table).collect()
      for (const row of rows) {
        await ctx.db.delete(row._id)
        deleted++
      }
    }
    return { deleted }
  },
})

const isoDate = (date: Date) => date.toISOString().slice(0, 10)
const daysFromNow = (days: number) => {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return isoDate(date)
}

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query('users').first()
    if (existing) throw new Error('Deployment already has data. Run seed:clear first.')

    // --- Calendar -----------------------------------------------------------
    // Dates are relative to the moment of seeding, so "today" is always inside
    // the active term and the Overview figures mean something.
    const previousYear = await ctx.db.insert('academicYears', { name: '2025/2026', isActive: false })
    const currentYear = await ctx.db.insert('academicYears', { name: '2026/2027', isActive: true })

    const previousTerm = await ctx.db.insert('terms', {
      academicYearId: previousYear,
      name: 'Term 3',
      startDate: daysFromNow(-160),
      endDate: daysFromNow(-90),
    })
    const currentTerm = await ctx.db.insert('terms', {
      academicYearId: currentYear,
      name: 'Term 1',
      startDate: daysFromNow(-21),
      endDate: daysFromNow(60),
    })

    // --- Structure ----------------------------------------------------------
    const grade10 = await ctx.db.insert('gradeLevels', { name: 'Grade 10' })
    const grade11 = await ctx.db.insert('gradeLevels', { name: 'Grade 11' })

    const sections: Record<string, Id<'classSections'>> = {}
    for (const [name, gradeLevelId] of [
      ['10A', grade10], ['10B', grade10], ['10 Science', grade10],
      ['11A', grade11], ['11B', grade11],
    ] as const) {
      sections[name] = await ctx.db.insert('classSections', {
        gradeLevelId,
        sectionName: name,
      })
    }

    for (const [name, code] of [
      ['Mathematics', 'MATH101'], ['English', 'ENG101'], ['Physics', 'PHY101'],
      ['Chemistry', 'CHM101'], ['Biology', 'BIO101'], ['Computer Studies', 'CMP101'],
    ] as const) {
      await ctx.db.insert('subjects', { name, code })
    }

    for (const [name, buildingName, capacity] of [
      ['Room 1', 'Main Block', 32], ['Room 2', 'Main Block', 32], ['Lab 1', 'Science Block', 24],
    ] as const) {
      await ctx.db.insert('classrooms', { name, buildingName, capacity })
    }

    for (const [name, startTime, endTime, isBreak] of [
      ['Period 1', '08:00', '08:45', false], ['Period 2', '08:50', '09:35', false],
      ['Break', '09:35', '09:55', true], ['Period 3', '09:55', '10:40', false],
      ['Period 4', '10:45', '11:30', false],
    ] as const) {
      await ctx.db.insert('periods', { name, startTime, endTime, isBreak })
    }

    for (const [letterGrade, minScore, maxScore, gpaPoint] of [
      ['A', 70, 100, 4], ['B', 60, 69, 3], ['C', 50, 59, 2], ['D', 40, 49, 1], ['F', 0, 39, 0],
    ] as const) {
      await ctx.db.insert('gradingScales', {
        name: 'Standard', letterGrade, minScore, maxScore, gpaPoint,
      })
    }

    // --- People -------------------------------------------------------------
    // Credentials are managed by Clerk; passwordHash exists in the schema but is
    // never a real hash here. See docs/DEVLOG.md entry 9.
    const addUser = (fullName: string, role: Doc<'users'>['role']) =>
      ctx.db.insert('users', {
        fullName,
        role,
        email: `${fullName.toLowerCase().replace(/[^a-z]+/g, '.')}@easyacademy.test`,
        passwordHash: 'managed-by-clerk',
      })

    const teacherSeeds = [
      ['Olumide Bankole', 'Sciences'], ['Patience Nduka', 'Mathematics'],
      ['Quadri Salami', 'Languages'], ['Rukayat Lawal', 'Humanities'],
      ['Samuel Otieno', 'Sciences'], ['Tolu Adeniyi', 'Creative Arts'],
      ['Uchenna Igwe', 'Mathematics'], ['Veronica Mensah', 'Languages'],
      ['Wale Ogundipe', 'Technology'], ['Yetunde Balogun', 'Physical Education'],
      ['Zainab Yusuf', 'Sciences'],
    ] as const

    const teacherIds: Id<'teachers'>[] = []
    for (const [fullName, specialization] of teacherSeeds) {
      const userId = await addUser(fullName, 'teacher')
      teacherIds.push(await ctx.db.insert('teachers', { userId, specialization }))
    }

    for (const [fullName, jobTitle, department] of [
      ['Amara Chukwu', 'Accountant', 'Finance'],
      ['Babatunde Alao', 'Registrar', 'Administration'],
      ['Chinelo Udeh', 'School Nurse', 'Welfare'],
      ['Dapo Fashola', 'Facilities Manager', 'Operations'],
      ['Esohe Iyamu', 'Librarian', 'Academic Support'],
      ['Femi Ogunlesi', 'IT Support Officer', 'Technology'],
    ] as const) {
      const userId = await addUser(fullName, 'staff')
      await ctx.db.insert('staff', { userId, jobTitle, department })
    }

    const studentSeeds = [
      ['Adaeze Okonkwo', '10A', '2009-03-12', 'present'],
      ['Bilal Hassan', '10A', '2009-07-04', 'present'],
      ['Chiamaka Eze', '10A', '2009-01-29', 'late'],
      ['Daniel Mwangi', '10B', '2008-11-16', 'absent'],
      ['Emeka Nwosu', '10B', '2009-05-02', 'present'],
      ['Fatima Bello', '10B', '2009-09-21', 'excused'],
      ['Grace Adeyemi', '10 Science', '2009-02-08', 'present'],
      ['Hassan Ibrahim', '10 Science', '2008-12-30', 'present'],
      ['Ifeoma Obi', '10 Science', '2009-06-17', 'late'],
      ['Joseph Kamau', '11A', '2008-04-11', 'present'],
      ['Khadija Sani', '11A', '2008-08-25', 'present'],
      ['Lekan Adebayo', '11A', '2008-10-03', 'absent'],
      ['Miriam Achieng', '11B', '2008-01-19', 'present'],
      ['Nnamdi Okafor', '11B', '2008-06-27', 'excused'],
    ] as const

    const studentIds: Record<string, Id<'students'>> = {}
    for (const [fullName, section, dateOfBirth] of studentSeeds) {
      const userId = await addUser(fullName, 'student')
      const classSectionId = sections[section]!
      const studentId = await ctx.db.insert('students', {
        userId,
        dateOfBirth,
        currentClassSectionId: classSectionId,
      })
      studentIds[fullName] = studentId

      await ctx.db.insert('studentEnrollments', {
        studentId,
        classSectionId,
        academicYearId: currentYear,
      })
    }

    // Twelve of the fourteen were also here last year, so the Overview's
    // year-on-year delta has a real basis rather than an invented one.
    for (const [fullName] of studentSeeds.slice(0, 12)) {
      await ctx.db.insert('studentEnrollments', {
        studentId: studentIds[fullName]!,
        classSectionId: sections['10A']!,
        academicYearId: previousYear,
      })
    }

    for (const [parentName, children] of [
      ['Ngozi Okonkwo', ['Adaeze Okonkwo']],
      ['Yusuf Hassan', ['Bilal Hassan']],
      ['Ada Eze', ['Chiamaka Eze']],
      ['James Mwangi', ['Daniel Mwangi']],
      ['Chidi Nwosu', ['Emeka Nwosu']],
      ['Aisha Bello', ['Fatima Bello']],
      ['Tunde Adeyemi', ['Grace Adeyemi']],
      ['Halima Ibrahim', ['Hassan Ibrahim']],
      ['Chukwuma Obi', ['Ifeoma Obi', 'Nnamdi Okafor']],
    ] as const) {
      const parentId = await addUser(parentName, 'parent')
      for (const child of children) {
        await ctx.db.insert('parentStudentRelations', {
          parentId,
          studentId: studentIds[child]!,
        })
      }
    }

    // --- Teaching assignments ----------------------------------------------
    const subjects = await ctx.db.query('subjects').collect()
    const sectionList = Object.values(sections)

    for (const [index, teacherId] of teacherIds.entries()) {
      await ctx.db.insert('teachingAssignments', {
        teacherId,
        subjectId: subjects[index % subjects.length]!._id,
        classSectionId: sectionList[index % sectionList.length]!,
        termId: currentTerm,
      })
    }
    // Nine taught last term, eleven teach now - a delta of +2.
    for (const teacherId of teacherIds.slice(0, 9)) {
      await ctx.db.insert('teachingAssignments', {
        teacherId,
        subjectId: subjects[0]!._id,
        classSectionId: sectionList[0]!,
        termId: previousTerm,
      })
    }

    // --- Registers ----------------------------------------------------------
    // Through the domain function, like every other caller.
    const attendance = convexAttendanceRepository(ctx.db)
    const registerTeacher = teacherIds[0]!

    for (const dayOffset of [0, -1] as const) {
      for (const [index, [fullName, section, , status]] of studentSeeds.entries()) {
        // Yesterday had a different spread, not a reshuffle of today's: rotating
        // the same statuses preserves their counts, which would make the
        // "vs yesterday" delta a flat zero and prove nothing.
        const onTheDay = dayOffset === 0 ? status : index % 7 === 0 ? 'absent' : 'present'

        const result = await recordAttendance(attendance, {
          studentId: asId(studentIds[fullName]!),
          classSectionId: asId(sections[section]!),
          teacherId: asId(registerTeacher),
          termId: asId(currentTerm),
          attendanceDate: daysFromNow(dayOffset),
          status: onTheDay as AttendanceStatus,
        })
        if (!result.ok) throw new Error(`seed attendance rejected: ${result.error.kind}`)
      }
    }

    return {
      students: studentSeeds.length,
      teachers: teacherIds.length,
      registersTakenFor: [daysFromNow(-1), daysFromNow(0)],
    }
  },
})

/**
 * Registers for the recent past, so the attendance trend has something to plot.
 *
 *   npx convex run seed:attendanceHistory
 *
 * Additive and idempotent: it goes through `recordAttendance`, which upserts, so
 * re-running corrects the same days rather than duplicating them. Weekends are
 * skipped, and any date falling outside the term is skipped rather than forced -
 * the domain would refuse it, and rightly.
 */
export const attendanceHistory = internalMutation({
  args: {},
  handler: async (ctx) => {
    const students = await ctx.db.query('students').collect()
    const teacher = await ctx.db.query('teachers').first()
    const term = await ctx.db.query('terms').order('desc').first()
    if (students.length === 0 || !teacher || !term) {
      throw new Error('Nothing to work with. Run seed:run first.')
    }

    const attendance = convexAttendanceRepository(ctx.db)
    const written: string[] = []
    const skipped: string[] = []

    // Walk back far enough to land 12 weekdays, today excluded.
    let weekdays = 0
    for (let back = 1; back <= 25 && weekdays < 12; back++) {
      const date = new Date()
      date.setUTCDate(date.getUTCDate() - back)
      const day = date.getUTCDay()
      if (day === 0 || day === 6) continue
      weekdays++

      const on = isoDate(date)
      let rejected = false

      for (const [index, student] of students.entries()) {
        if (!student.currentClassSectionId) continue

        // A deterministic spread that differs day to day, so the trend line has
        // shape without being random noise that changes on every re-seed.
        const seed = (index * 7 + weekdays * 3) % 20
        const status: AttendanceStatus =
          seed === 0 ? 'absent' : seed === 1 ? 'late' : seed === 2 ? 'excused' : 'present'

        const result = await recordAttendance(attendance, {
          studentId: asId(student._id),
          classSectionId: asId(student.currentClassSectionId),
          teacherId: asId(teacher._id),
          termId: asId(term._id),
          attendanceDate: on,
          status,
        })

        if (!result.ok) {
          rejected = true
          break
        }
      }

      if (rejected) skipped.push(on)
      else written.push(on)
    }

    return { written: written.length, skipped: skipped.length, days: written.sort() }
  },
})

/**
 * A starting timetable.
 *
 *   npx convex run seed:timetable
 *
 * Every lesson goes through `placeSlot`, so the collision rules apply to seeded
 * data exactly as they do to a user. Placements that clash are counted and
 * skipped rather than forced - a fixture that bypasses the rule would produce a
 * timetable the application itself considers impossible.
 */
export const timetable = internalMutation({
  args: {},
  handler: async (ctx) => {
    const term = await ctx.db.query('terms').order('desc').first()
    if (!term) throw new Error('No term. Run seed:run first.')

    const assignments = await ctx.db
      .query('teachingAssignments')
      .withIndex('by_term', (q) => q.eq('termId', term._id))
      .collect()
    const classrooms = await ctx.db.query('classrooms').collect()
    const periods = (await ctx.db.query('periods').collect())
      .filter((period) => !period.isBreak)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
    const sections = await ctx.db.query('classSections').collect()

    if (assignments.length === 0 || classrooms.length === 0 || periods.length === 0) {
      throw new Error('Nothing to place. Run seed:run first.')
    }

    const repo = convexTimetableRepository(ctx.db)
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const

    let placed = 0
    let clashed = 0
    let turn = 0

    for (const day of days) {
      for (const period of periods) {
        for (const section of sections) {
          const forSection = assignments.filter(
            (assignment) => assignment.classSectionId === section._id
          )
          if (forSection.length === 0) continue

          const assignment = forSection[turn % forSection.length]!
          const classroom = classrooms[turn % classrooms.length]!
          turn++

          const result = await placeSlot(repo, {
            termId: asId(term._id),
            teachingAssignmentId: asId(assignment._id),
            teacherId: asId(assignment.teacherId),
            classSectionId: asId(section._id),
            subjectId: asId(assignment.subjectId),
            classroomId: asId(classroom._id),
            dayOfWeek: day,
            periodId: asId(period._id),
          })

          if (result.ok) placed++
          else clashed++
        }
      }
    }

    return { placed, clashed }
  },
})

/**
 * Assessments and marks, so there is something to calculate results from.
 *
 *   npx convex run seed:marks
 *
 * Marks go through `recordMark`, so the score/status rules apply here too: a
 * student marked absent carries no score, and every score is checked against its
 * own assessment maximum.
 */
export const marks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const term = await ctx.db.query('terms').order('desc').first()
    if (!term) throw new Error('No term. Run seed:run first.')

    const assignments = await ctx.db
      .query('teachingAssignments')
      .withIndex('by_term', (q) => q.eq('termId', term._id))
      .collect()

    const repo = convexMarksRepository(ctx.db)
    let assessmentCount = 0
    let markCount = 0

    for (const assignment of assignments) {
      if (!assignment.classSectionId) continue

      const blueprint = [
        { name: 'Mid-term test', weight: 0.4, maxScore: 50 },
        { name: 'End of term exam', weight: 0.6, maxScore: 100 },
      ]

      const enrolments = await ctx.db
        .query('studentEnrollments')
        .withIndex('by_class_year', (q) =>
          q
            .eq('classSectionId', assignment.classSectionId!)
            .eq('academicYearId', term.academicYearId)
        )
        .collect()

      for (const paper of blueprint) {
        const assessmentId = await ctx.db.insert('assessments', {
          assignmentId: assignment._id,
          termId: term._id,
          name: paper.name,
          weight: paper.weight,
          maxScore: paper.maxScore,
        })
        assessmentCount++

        for (const [index, enrolment] of enrolments.entries()) {
          // Deterministic spread, with the occasional absence and excusal so the
          // status rules in calculateSubjectResult are exercised by real rows.
          const spread = (index * 13 + assessmentCount * 5) % 20
          const status = spread === 0 ? 'absent' : spread === 1 ? 'excused' : 'present'
          const fraction = 0.45 + ((index * 7 + assessmentCount * 3) % 55) / 100

          const result = await recordMark(repo, {
            assessmentId: asId(assessmentId),
            studentId: asId(enrolment.studentId),
            status,
            score: status === 'present' ? Math.round(paper.maxScore * fraction) : undefined,
          })
          if (!result.ok) throw new Error(`seed mark rejected: ${result.error.kind}`)
          markCount++
        }
      }
    }

    return { assessments: assessmentCount, marks: markCount }
  },
})

/**
 * Makes a user an administrator, creating the record if it does not exist.
 *
 *   npx convex run seed:grantAdmin '{"email":"you@example.com","fullName":"Your Name"}'
 *
 * The seeded school has teachers, staff, parents and students but no admin,
 * because a real school's first administrator is created by whoever sets the
 * system up rather than by a fixture.
 */
export const grantAdmin = internalMutation({
  args: { email: v.string(), fullName: v.string() },
  handler: async (ctx, { email, fullName }) => {
    const existing = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email))
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, { role: 'admin' })
      return { userId: existing._id, created: false }
    }

    const userId = await ctx.db.insert('users', {
      email,
      fullName,
      role: 'admin',
      passwordHash: 'managed-by-clerk',
    })
    return { userId, created: true }
  },
})

/**
 * Sample merit and demerit records in the active term.
 *
 *   npx convex run seed:behavior
 *
 * Routed through `recordBehavior`, so severity (1-5) and term date bounds are
 * checked on the seeded entries too.
 */
export const behavior = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query('behaviorRecords').first()
    if (existing) return { inserted: 0, skipped: true }

    const term = await activeTerm(ctx)
    if (!term) throw new Error('No active term. Run seed:run first.')

    const students = await ctx.db.query('students').collect()
    const teachers = await ctx.db.query('teachers').collect()
    if (students.length === 0 || teachers.length === 0) {
      throw new Error('Nothing to work with. Run seed:run first.')
    }

    const clampToTerm = (candidate: string) => {
      if (candidate < term.startDate) return term.startDate
      if (candidate > term.endDate) return term.endDate
      return candidate
    }

    const entries = [
      {
        studentIndex: 0,
        teacherIndex: 0,
        type: 'merit' as const,
        severityLevel: 2,
        description: 'Assisted peers during practical physics lab setup.',
        offset: -6,
        actionTaken: 'Commendation noted in register',
      },
      {
        studentIndex: 2,
        teacherIndex: 1,
        type: 'demerit' as const,
        severityLevel: 2,
        description: 'Arrived late to morning assembly without pass.',
        offset: -5,
        actionTaken: 'Verbal reminder issued',
      },
      {
        studentIndex: 3,
        teacherIndex: 2,
        type: 'demerit' as const,
        severityLevel: 3,
        description: 'Missed deadline for English coursework submission.',
        offset: -4,
        actionTaken: 'Extended study period scheduled',
      },
      {
        studentIndex: 6,
        teacherIndex: 0,
        type: 'merit' as const,
        severityLevel: 4,
        description: 'Represented the school at the regional mathematics olympiad.',
        offset: -3,
        actionTaken: 'Principal commendation letter',
      },
      {
        studentIndex: 9,
        teacherIndex: 3,
        type: 'merit' as const,
        severityLevel: 3,
        description: 'Led peer study group ahead of mid-term assessments.',
        offset: -2,
        actionTaken: 'House merit awarded',
      },
      {
        studentIndex: 11,
        teacherIndex: 4,
        type: 'demerit' as const,
        severityLevel: 1,
        description: 'Uniform tie missing during afternoon lessons.',
        offset: -1,
        actionTaken: 'Form teacher notified',
      },
    ]

    const repo = convexBehaviorRepository(ctx.db)
    let inserted = 0

    for (const entry of entries) {
      const student = students[entry.studentIndex % students.length]!
      const teacher = teachers[entry.teacherIndex % teachers.length]!
      const result = await recordBehavior(repo, {
        studentId: asId(student._id),
        teacherId: asId(teacher._id),
        termId: asId(term._id),
        type: entry.type,
        severityLevel: entry.severityLevel,
        description: entry.description,
        incidentDate: clampToTerm(daysFromNow(entry.offset)),
        actionTaken: entry.actionTaken,
      })
      if (!result.ok) throw new Error(`seed behavior rejected: ${result.error.kind}`)
      inserted++
    }

    return { inserted, skipped: false }
  },
})

export const removeUserByEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase()
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email))
      .first()
    if (!user) return { deleted: false }
    await ctx.db.delete(user._id)
    return { deleted: true, userId: user._id }
  },
})
