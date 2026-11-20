<script setup lang="ts">
// DESIGN.md 5.5 - pill badge, sign prefix comes from the value itself.
const props = defineProps<{
  value: number
  /** Renders as "+1.1%" instead of "+18". */
  percent?: boolean
}>()

const tone = computed(() =>
  props.value > 0 ? 'positive' : props.value < 0 ? 'negative' : 'neutral'
)

const label = computed(() => {
  const sign = props.value > 0 ? '+' : ''
  return `${sign}${props.value}${props.percent ? '%' : ''}`
})

const classes = {
  positive: 'bg-positive-bg text-positive-text',
  negative: 'bg-negative-bg text-negative-text',
  neutral: 'bg-neutral-bg text-ink-secondary',
}
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2.5 py-1 text-badge font-semibold"
    :class="classes[tone]"
  >{{ label }}</span>
</template>
