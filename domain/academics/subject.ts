import { err, ok, type Result } from '../result'
import type { SubjectId } from '../ids'
import type { AcademicsRepository } from './ports'

export type SubjectProblem =
  | { kind: 'nameRequired' }
  | { kind: 'codeRequired' }
  | { kind: 'duplicateCode'; code: string }

/**
 * Normalises a subject code: trimmed, upper-cased, inner spaces removed.
 *
 * Uniqueness is judged on this form, so "math 101", "Math101" and "MATH101" are
 * the same code and the second one entered is refused rather than quietly
 * creating a near-duplicate subject nobody notices until reports disagree.
 */
export function normaliseCode(code: string): string {
  return code.trim().replace(/\s+/g, '').toUpperCase()
}

export async function addSubject(
  repo: AcademicsRepository,
  input: { name: string; code: string }
): Promise<Result<SubjectId, SubjectProblem>> {
  const name = input.name.trim()
  if (name === '') return err({ kind: 'nameRequired' })

  const code = normaliseCode(input.code)
  if (code === '') return err({ kind: 'codeRequired' })

  const existing = await repo.findSubjectByCode(code)
  if (existing) return err({ kind: 'duplicateCode', code })

  return ok(await repo.insertSubject({ name, code }))
}

/** Plain-language text, in the voice set by docs/DESIGN.md section 6. */
export function describeSubjectProblem(problem: SubjectProblem): string {
  switch (problem.kind) {
    case 'nameRequired':
      return 'A subject needs a name.'
    case 'codeRequired':
      return 'A subject needs a code.'
    case 'duplicateCode':
      return `${problem.code} is already used by another subject.`
  }
}
