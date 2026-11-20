import { err, ok, type Result } from '../result'
import type { ResultsRepository, TermSummary } from './ports'
import type { TermSummaryId } from '../ids'

export type PublishProblem =
  | { kind: 'summaryNotFound' }
  | { kind: 'alreadyPublished' }
  | { kind: 'notPublished' }
  | { kind: 'incomplete'; missing: string[] }
  | { kind: 'noSubjectResults' }

/**
 * Publishing is the moment a report card becomes visible to a parent, and it is
 * the one action in this product that cannot be quietly undone in the reader's
 * memory. So the gate is deliberate: a summary must carry its attendance
 * totals, a computed GPA, and at least one subject result before it can go out.
 *
 * The isPublished flag lives on the record; nothing here reads or trusts a
 * caller's claim about the current state.
 */
export async function publishTermSummary(
  repo: ResultsRepository,
  summaryId: TermSummaryId
): Promise<Result<TermSummary, PublishProblem>> {
  const summary = await repo.findSummary(summaryId)
  if (!summary) return err({ kind: 'summaryNotFound' })
  if (summary.isPublished) return err({ kind: 'alreadyPublished' })

  const missing = missingFields(summary)
  if (missing.length > 0) return err({ kind: 'incomplete', missing })

  const subjectResults = await repo.countSubjectResults({
    studentId: summary.studentId,
    termId: summary.termId,
  })
  if (subjectResults === 0) return err({ kind: 'noSubjectResults' })

  await repo.setPublished(summaryId, true)
  return ok({ ...summary, isPublished: true })
}

/**
 * Withdraws a published report card. Kept separate from publishing so neither
 * action can happen by accident through a toggle that flips whatever it finds.
 */
export async function withdrawTermSummary(
  repo: ResultsRepository,
  summaryId: TermSummaryId
): Promise<Result<TermSummary, PublishProblem>> {
  const summary = await repo.findSummary(summaryId)
  if (!summary) return err({ kind: 'summaryNotFound' })
  if (!summary.isPublished) return err({ kind: 'notPublished' })

  await repo.setPublished(summaryId, false)
  return ok({ ...summary, isPublished: false })
}

/** Human-readable names, because this list is shown to the user verbatim. */
function missingFields(summary: TermSummary): string[] {
  const missing: string[] = []
  if (summary.termGpa === undefined) missing.push('term GPA')
  if (summary.totalDaysPresent === undefined) missing.push('days present')
  if (summary.totalDaysAbsent === undefined) missing.push('days absent')
  return missing
}

/** Plain-language text, in the voice set by docs/DESIGN.md section 6. */
export function describePublishProblem(problem: PublishProblem): string {
  switch (problem.kind) {
    case 'summaryNotFound':
      return 'That report card no longer exists.'
    case 'alreadyPublished':
      return 'This report card is already published.'
    case 'notPublished':
      return 'This report card has not been published yet.'
    case 'incomplete':
      return `This report card still needs ${formatList(problem.missing)}.`
    case 'noSubjectResults':
      return 'This report card has no subject results yet.'
  }
}

function formatList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
