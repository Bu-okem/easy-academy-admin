import type { Id } from '../_generated/dataModel'
import type { DatabaseReader, DatabaseWriter } from '../_generated/server'

export const FORM_TEACHER_SUBJECT_CODE = 'FORM'

/**
 * Looks up the form teacher assigned to a class section in a term.
 * Stored as a teachingAssignment pointing to the hidden `FORM` subject so
 * teachers without a form class (e.g. part-time or specialist staff) need no link.
 */
export async function getFormTeacherForSection(
  db: DatabaseReader,
  classSectionId: Id<'classSections'>,
  termId: Id<'terms'>
): Promise<{ id: Id<'teachers'>; name: string } | null> {
  const formSubject = await db
    .query('subjects')
    .withIndex('by_code', (q) => q.eq('code', FORM_TEACHER_SUBJECT_CODE))
    .first()
  if (!formSubject) return null

  const assignments = await db
    .query('teachingAssignments')
    .withIndex('by_class_term', (q) => q.eq('classSectionId', classSectionId).eq('termId', termId))
    .collect()

  const match = assignments.find((row) => row.subjectId === formSubject._id)
  if (!match) return null

  const teacher = await db.get(match.teacherId)
  if (!teacher) return null
  const user = await db.get(teacher.userId)
  return { id: teacher._id, name: user?.fullName ?? 'Unknown teacher' }
}

/** Returns the `FORM` subject ID, creating it if it does not exist yet. */
export async function ensureFormTeacherSubject(db: DatabaseWriter): Promise<Id<'subjects'>> {
  const existing = await db
    .query('subjects')
    .withIndex('by_code', (q) => q.eq('code', FORM_TEACHER_SUBJECT_CODE))
    .first()
  if (existing) return existing._id
  return await db.insert('subjects', {
    name: 'Form Teacher',
    code: FORM_TEACHER_SUBJECT_CODE,
  })
}
