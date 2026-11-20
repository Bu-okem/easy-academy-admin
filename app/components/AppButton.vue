<script setup lang="ts">
// DESIGN.md 5.7 - primary (brass), secondary (outlined), ghost.
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost'
    type?: 'button' | 'submit'
    disabled?: boolean
  }>(),
  { variant: 'primary', type: 'button' }
)

const styles = {
  primary: 'bg-brass text-white hover:bg-brass-dark',
  secondary: 'bg-surface text-ink border border-hairline hover:bg-page',
  ghost: 'text-ink-secondary hover:bg-page',
} as const
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    class="inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-body font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
    :class="styles[variant]"
  >
    <slot />
  </button>
</template>
