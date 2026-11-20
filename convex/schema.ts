// This file and docs/convex-schema.txt are kept byte-identical: the doc is the
// spec, this is the code, and `diff convex/schema.ts docs/convex-schema.txt`
// must come back empty. Change a table here, copy the file across, and reflect
// anything the prose layer cares about in docs/schema.txt.

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ===========================================================================
  // 1. IDENTITY & ACCESS LAYER
  // ===========================================================================
  users: defineTable({
    email: v.string(),
    // The join between a signed-in identity and the school's own record of that
    // person. Holds Convex's `tokenIdentifier` (issuer + subject), which the
    // Convex guidelines require over `subject` alone as an identity key.
    // Optional because a school imports its roll before anyone has signed in.
    authTokenIdentifier: v.optional(v.string()),
    // Vestigial: Clerk manages credentials, so this never holds a real hash.
    passwordHash: v.string(),
    fullName: v.string(),
    role: v.union(
      v.literal("admin"),
      v.literal("teacher"),
      v.literal("staff"),
      v.literal("parent"),
      v.literal("student")
    ),
  })
    .index("by_email", ["email"])
    // The People screen lists one role at a time, and parents have no profile
    // table of their own to paginate.
    .index("by_role", ["role"])
    // Every authenticated request resolves the caller through this.
    .index("by_auth_token", ["authTokenIdentifier"]),

  students: defineTable({
    userId: v.id("users"),
    dateOfBirth: v.string(), // ISO String "YYYY-MM-DD"
    currentClassSectionId: v.optional(v.id("classSections")),
  }).index("by_user", ["userId"]),

  teachers: defineTable({
    userId: v.id("users"),
    specialization: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  staff: defineTable({
    userId: v.id("users"),
    jobTitle: v.string(),
    department: v.string(),
  }).index("by_user", ["userId"]),

  parentStudentRelations: defineTable({
    parentId: v.id("users"),
    studentId: v.id("students"),
  })
    .index("by_parent", ["parentId"])
    .index("by_student", ["studentId"]),

  // ===========================================================================
  // 2. ACADEMIC STRUCTURE LAYER
  // ===========================================================================
  academicYears: defineTable({
    name: v.string(), // e.g., "2023/2024"
    isActive: v.boolean(),
  }),

  terms: defineTable({
    academicYearId: v.id("academicYears"),
    name: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  }).index("by_academic_year", ["academicYearId"]),

  gradeLevels: defineTable({
    name: v.string(), // e.g., "Grade 10"
  }),

  classSections: defineTable({
    gradeLevelId: v.id("gradeLevels"),
    sectionName: v.string(), // e.g., "A", "Science"
  }).index("by_grade", ["gradeLevelId"]),

  subjects: defineTable({
    name: v.string(),
    code: v.string(),
  }).index("by_code", ["code"]),

  classrooms: defineTable({
    name: v.string(),
    capacity: v.optional(v.number()),
    buildingName: v.optional(v.string()),
  }),

  periods: defineTable({
    name: v.string(),
    startTime: v.string(), // "08:00"
    endTime: v.string(), // "08:45"
    isBreak: v.boolean(),
  }),

  // ===========================================================================
  // 3. ENROLLMENT & ASSIGNMENT LAYER
  // ===========================================================================
  studentEnrollments: defineTable({
    studentId: v.id("students"),
    classSectionId: v.id("classSections"),
    academicYearId: v.id("academicYears"),
  })
    .index("by_student_year", ["studentId", "academicYearId"])
    .index("by_class_year", ["classSectionId", "academicYearId"])
    // Overview KPI: how many students are enrolled across the whole school
    // this year. The two indexes above both require a student or a section.
    .index("by_year", ["academicYearId"]),

  studentSubjectEnrollments: defineTable({
    studentId: v.id("students"),
    subjectId: v.id("subjects"),
    termId: v.id("terms"),
  }).index("by_student_term", ["studentId", "termId"]),

  teachingAssignments: defineTable({
    teacherId: v.id("teachers"),
    subjectId: v.id("subjects"),
    classSectionId: v.optional(v.id("classSections")), // Optional for specialists
    termId: v.id("terms"),
  })
    .index("by_teacher_term", ["teacherId", "termId"])
    .index("by_class_term", ["classSectionId", "termId"])
    // Overview KPI: how many teachers are assigned anything this term.
    .index("by_term", ["termId"]),

  // ===========================================================================
  // 4. OPERATIONAL LAYERS (Timetable, Attendance, Behavior, Grading)
  // ===========================================================================
  timetableSlots: defineTable({
    termId: v.id("terms"),
    teachingAssignmentId: v.id("teachingAssignments"),
    teacherId: v.id("teachers"),
    classSectionId: v.id("classSections"),
    subjectId: v.id("subjects"),
    classroomId: v.id("classrooms"),
    dayOfWeek: v.union(
      v.literal("Monday"),
      v.literal("Tuesday"),
      v.literal("Wednesday"),
      v.literal("Thursday"),
      v.literal("Friday"),
      v.literal("Saturday")
    ),
    periodId: v.id("periods"),
  })
    // Convex indexes are not unique constraints. These three exist so a mutation
    // can cheaply look up a conflicting slot before inserting; the double-booking
    // rule is enforced in the mutation, not by the database.
    .index("prevent_teacher_collision", ["termId", "teacherId", "dayOfWeek", "periodId"])
    .index("prevent_room_collision", ["termId", "classroomId", "dayOfWeek", "periodId"])
    .index("prevent_class_collision", ["termId", "classSectionId", "dayOfWeek", "periodId"]),

  attendanceRecords: defineTable({
    studentId: v.id("students"),
    classSectionId: v.id("classSections"),
    teacherId: v.id("teachers"),
    termId: v.id("terms"),
    attendanceDate: v.string(), // "YYYY-MM-DD"
    status: v.union(
      v.literal("present"),
      v.literal("absent"),
      v.literal("late"),
      v.literal("excused")
    ),
    remarks: v.optional(v.string()),
  })
    .index("unique_daily_attendance", ["studentId", "classSectionId", "attendanceDate"])
    // Term rollup for termSummaries (totalDaysPresent / totalDaysAbsent).
    .index("by_student_term", ["studentId", "termId"])
    // The daily register: every student in one section on one date.
    .index("by_class_date", ["classSectionId", "attendanceDate"])
    // Overview KPI: attendance across the whole school for one date.
    .index("by_date", ["attendanceDate"]),

  behaviorRecords: defineTable({
    studentId: v.id("students"),
    teacherId: v.id("teachers"),
    termId: v.id("terms"),
    type: v.union(v.literal("merit"), v.literal("demerit")),
    severityLevel: v.number(), // 1 to 5
    description: v.string(),
    incidentDate: v.string(),
    actionTaken: v.optional(v.string()),
  }).index("by_student_term", ["studentId", "termId"]),

  assessments: defineTable({
    assignmentId: v.id("teachingAssignments"),
    termId: v.id("terms"),
    name: v.string(),
    weight: v.number(), // e.g., 0.4
    maxScore: v.number(), // e.g., 100
  }).index("by_assignment", ["assignmentId"]),

  studentMarks: defineTable({
    assessmentId: v.id("assessments"),
    studentId: v.id("students"),
    score: v.optional(v.number()),
    status: v.union(
      v.literal("present"),
      v.literal("absent"),
      v.literal("excused"),
      v.literal("incomplete")
    ),
  })
    .index("unique_student_assessment", ["studentId", "assessmentId"])
    // Mark entry screen: every student's mark for one assessment.
    .index("by_assessment", ["assessmentId"]),

  // ===========================================================================
  // 5. REPORTING LAYER (The Snapshots)
  // ===========================================================================
  gradingScales: defineTable({
    name: v.string(),
    letterGrade: v.string(),
    minScore: v.number(),
    maxScore: v.number(),
    gpaPoint: v.number(),
  }),

  termSubjectResults: defineTable({
    studentId: v.id("students"),
    termId: v.id("terms"),
    subjectId: v.id("subjects"),
    teacherId: v.id("teachers"),
    cumulativeScore: v.number(),
    letterGrade: v.string(),
    teacherRemark: v.optional(v.string()),
  }).index("unique_student_term_subject", ["studentId", "termId", "subjectId"]),

  termSummaries: defineTable({
    studentId: v.id("students"),
    termId: v.id("terms"),
    classSectionId: v.id("classSections"),
    totalDaysPresent: v.optional(v.number()),
    totalDaysAbsent: v.optional(v.number()),
    termGpa: v.optional(v.number()),
    formTeacherRemark: v.optional(v.string()),
    principalRemark: v.optional(v.string()),
    isPublished: v.boolean(),
  })
    .index("unique_student_term", ["studentId", "termId"])
    // Results screen: the publish queue for one class in one term.
    .index("by_class_term", ["classSectionId", "termId"]),
});
