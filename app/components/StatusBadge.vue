<script setup lang="ts">
// DESIGN.md 5.6 + section 6 - labels mirror the schema's own vocabulary, so the
// UI and the data model never disagree on terms.
type Status =
  | 'present' | 'absent' | 'late' | 'excused'
  | 'merit' | 'demerit'
  | 'published' | 'draft'
  | 'pending' | 'incomplete'

const props = defineProps<{ status: Status }>()

const tones: Record<Status, string> = {
  present: 'bg-positive-bg text-positive-text',
  merit: 'bg-positive-bg text-positive-text',
  published: 'bg-positive-bg text-positive-text',
  absent: 'bg-negative-bg text-negative-text',
  demerit: 'bg-negative-bg text-negative-text',
  late: 'bg-caution-bg text-caution-text',
  draft: 'bg-caution-bg text-caution-text',
  excused: 'bg-info-bg text-info-text',
  pending: 'bg-info-bg text-info-text',
  incomplete: 'bg-neutral-bg text-ink-secondary',
}

const label = computed(() => props.status[0]!.toUpperCase() + props.status.slice(1))
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2.5 py-1 text-badge font-semibold"
    :class="tones[status]"
  >{{ label }}</span>
</template>
