<script setup lang="ts">
// DESIGN.md 5.11 - leading tinted icon circle, title and supporting line,
// trailing metadata right-aligned.
withDefaults(
  defineProps<{
    title: string
    detail?: string
    icon?: string
    /** Tints the icon circle, per DESIGN.md section 4. */
    severity?: 'warning' | 'accent' | 'neutral'
  }>(),
  { severity: 'accent', icon: 'alert' }
)

const tints = {
  warning: 'bg-negative-bg text-negative-text',
  accent: 'bg-brass-tint text-brass-dark',
  neutral: 'bg-page text-ink-secondary',
} as const
</script>

<template>
  <li class="flex items-start gap-3 border-b border-hairline py-3 last:border-b-0">
    <span
      class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
      :class="tints[severity]"
    >
      <AppIcon :name="icon" :size="18" />
    </span>

    <span class="min-w-0 flex-1">
      <span class="block text-body font-medium text-ink">{{ title }}</span>
      <span v-if="detail" class="mt-0.5 block text-caption text-ink-secondary">{{ detail }}</span>
    </span>

    <span v-if="$slots.trailing" class="shrink-0 whitespace-nowrap pl-2 text-caption">
      <slot name="trailing" />
    </span>
  </li>
</template>
