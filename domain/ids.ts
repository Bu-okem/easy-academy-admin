/**
 * Domain identifiers are opaque strings, deliberately not Convex `Id<"table">`.
 * Branding keeps them from being passed to the wrong parameter while leaving
 * the runtime value a plain string any database can produce.
 */
declare const brand: unique symbol

type Id<TTable extends string> = string & { readonly [brand]: TTable }

export type TermId = Id<'terms'>
export type TeacherId = Id<'teachers'>
export type StudentId = Id<'students'>
export type SubjectId = Id<'subjects'>
export type ClassSectionId = Id<'classSections'>
export type ClassroomId = Id<'classrooms'>
export type PeriodId = Id<'periods'>
export type TeachingAssignmentId = Id<'teachingAssignments'>
export type TimetableSlotId = Id<'timetableSlots'>

/** Widen a raw string from the edge (a mutation arg, a URL param) into a domain id. */
export function asId<T extends string>(value: string): Id<T> {
  return value as Id<T>
}

export type AcademicYearId = Id<'academicYears'>
export type GradeLevelId = Id<'gradeLevels'>
export type AssessmentId = Id<'assessments'>
export type AttendanceRecordId = Id<'attendanceRecords'>
export type StudentMarkId = Id<'studentMarks'>
export type TermSummaryId = Id<'termSummaries'>
export type BehaviorRecordId = Id<'behaviorRecords'>
export type GradingScaleId = Id<'gradingScales'>
export type UserId = Id<'users'>
