import { asId } from '../ids'
import type { AssessmentId, TeachingAssignmentId, TermId } from '../ids'
import type {
  AssessmentBlueprint,
  MarksRepository,
  StudentMark,
} from '../marks/ports'

export interface InMemoryMarksRepository extends MarksRepository {
  rows(): readonly StudentMark[]
  seedAssignment(assignment: { id: TeachingAssignmentId; termId: TermId }): void
  seedAssessment(assessment: AssessmentBlueprint): void
  seed(marks: ReadonlyArray<Omit<StudentMark, 'id'>>): void
}

export function inMemoryMarksRepository(): InMemoryMarksRepository {
  const marks: StudentMark[] = []
  const assignments = new Map<string, { id: TeachingAssignmentId; termId: TermId }>()
  const assessments = new Map<string, AssessmentBlueprint>()
  let sequence = 0

  const add = (mark: Omit<StudentMark, 'id'>) => {
    const id = asId<'studentMarks'>(`mark_${++sequence}`)
    marks.push({ id, ...mark })
    return id
  }

  return {
    async findAssessment(assessmentId: AssessmentId) {
      return assessments.get(assessmentId) ?? null
    },
    async findAssignment(assignmentId: TeachingAssignmentId) {
      return assignments.get(assignmentId) ?? null
    },
    async listAssessmentsForAssignment(assignmentId: TeachingAssignmentId) {
      return [...assessments.values()]
        .filter((a) => a.assignmentId === assignmentId)
        .map((a) => ({
          id: a.id,
          name: a.name,
          weight: a.weight ?? 0,
          maxScore: a.maxScore,
        }))
    },
    async insertAssessment(input) {
      const id = asId<'assessments'>(`assessment_${++sequence}`)
      assessments.set(id, {
        id,
        assignmentId: input.assignmentId,
        name: input.name,
        weight: input.weight,
        maxScore: input.maxScore,
      })
      return id
    },
    async findMark({ studentId, assessmentId }) {
      return (
        marks.find((m) => m.studentId === studentId && m.assessmentId === assessmentId) ?? null
      )
    },
    async insert(mark) {
      return add(mark)
    },
    async amend(id, patch) {
      const row = marks.find((m) => m.id === id)
      if (!row) throw new Error(`no mark ${id}`)
      row.score = patch.score
      row.status = patch.status
    },
    rows: () => marks,
    seedAssignment(assignment) {
      assignments.set(assignment.id, assignment)
    },
    seedAssessment(assessment) {
      assessments.set(assessment.id, assessment)
    },
    seed(seeded) {
      seeded.forEach(add)
    },
  }
}
