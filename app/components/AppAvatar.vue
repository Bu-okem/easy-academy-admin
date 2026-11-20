<script setup lang="ts">
// DESIGN.md 5.14 - circle, brass fill, white initials.
// 28px in table rows, 36px in the top bar, 48px on a profile header.
const props = withDefaults(
  defineProps<{
    name: string
    size?: 28 | 36 | 48
  }>(),
  { size: 36 }
)

/** First and last initial: "Ada Lovelace" -> "AL", "Chibuokem" -> "C". */
const initials = computed(() => {
  const parts = props.name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]![0]!
  const last = parts.length > 1 ? parts[parts.length - 1]![0]! : ''
  return (first + last).toUpperCase()
})

const sizing = {
  28: 'h-7 w-7 text-[11px]',
  36: 'h-9 w-9 text-badge',
  48: 'h-12 w-12 text-body',
} as const
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-full bg-brass font-semibold text-white"
    :class="sizing[size]"
    :title="name"
  >{{ initials }}</span>
</template>
