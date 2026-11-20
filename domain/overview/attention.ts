import type { AttendanceStatus } from '../attendance/ports'

/** One class section's register for a single day. */
export interface RegisterStatus {
  sectionName: string
  /** Statuses recorded so far. Empty means no register was taken at all. */
  statuses: readonly AttendanceStatus[]
  /** How many students are enrolled in the section. */
  enrolled: number
}

export type AttentionItem =
  | { kind: 'registerNotTaken'; sectionName: string }
  | { kind: 'registerIncomplete'; sectionName: string; recorded: number; enrolled: number }
  | { kind: 'studentsAbsent'; count: number }

/**
 * What a registrar needs to look at today.
 *
 * Deciding what counts as needing attention is a rule, not presentation, so it
 * lives here rather than in the component that draws the list.
 *
 * Ordering is deliberate: a register nobody has started is more urgent than a
 * half-finished one, which is more urgent than a tally of absences that someone
 * has already recorded. Within a kind, sections are listed alphabetically so the
 * list does not reshuffle itself between renders.
 */
export function attentionItems(registers: readonly RegisterStatus[]): AttentionItem[] {
  const byName = (a: { sectionName: string }, b: { sectionName: string }) =>
    a.sectionName.localeCompare(b.sectionName)

  const notTaken: AttentionItem[] = registers
    .filter((register) => register.enrolled > 0 && register.statuses.length === 0)
    .map((register) => ({ kind: 'registerNotTaken' as const, sectionName: register.sectionName }))
    .sort(byName)

  const incomplete: AttentionItem[] = registers
    .filter(
      (register) =>
        register.statuses.length > 0 && register.statuses.length < register.enrolled
    )
    .map((register) => ({
      kind: 'registerIncomplete' as const,
      sectionName: register.sectionName,
      recorded: register.statuses.length,
      enrolled: register.enrolled,
    }))
    .sort(byName)

  // Absences are counted across every register, so this is one line, not one per
  // class - a registrar wants the number, then somewhere to click.
  const absent = registers
    .flatMap((register) => register.statuses)
    .filter((status) => status === 'absent').length

  return [
    ...notTaken,
    ...incomplete,
    ...(absent > 0 ? [{ kind: 'studentsAbsent' as const, count: absent }] : []),
  ]
}

/** Plain-language text, in the voice set by docs/DESIGN.md section 6. */
export function describeAttention(item: AttentionItem): { title: string; detail: string } {
  switch (item.kind) {
    case 'registerNotTaken':
      return {
        title: `${item.sectionName} has no register today`,
        detail: 'Take the register to record who is present.',
      }
    case 'registerIncomplete':
      return {
        title: `${item.sectionName} register is part done`,
        detail: `${item.recorded} of ${item.enrolled} students recorded.`,
      }
    case 'studentsAbsent':
      return {
        title: item.count === 1 ? '1 student absent today' : `${item.count} students absent today`,
        detail: 'Absences recorded across all registers taken so far.',
      }
  }
}

/** Which tint the leading icon circle takes (docs/DESIGN.md section 4). */
export function severityOf(item: AttentionItem): 'warning' | 'accent' {
  return item.kind === 'studentsAbsent' ? 'accent' : 'warning'
}
