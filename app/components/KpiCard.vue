<script setup lang="ts">
// DESIGN.md 5.4
defineProps<{
  label: string
  value: string
  icon: string
  delta?: number
  deltaPercent?: boolean
  /** e.g. "vs last term", "vs yesterday" */
  comparison?: string
}>()
</script>

<template>
  <div class="rounded-lg bg-surface p-6 shadow-card">
    <div class="flex items-start justify-between gap-4">
      <span class="text-body font-medium text-ink-secondary">{{ label }}</span>
      <span
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brass-tint text-brass-dark"
      >
        <AppIcon :name="icon" />
      </span>
    </div>

    <p class="mt-2 font-display text-stat font-semibold text-ink">{{ value }}</p>

    <div v-if="delta !== undefined" class="mt-3 flex items-center gap-2">
      <DeltaBadge :value="delta" :percent="deltaPercent" />
      <span class="text-caption text-ink-secondary">{{ comparison }}</span>
    </div>
  </div>
</template>
