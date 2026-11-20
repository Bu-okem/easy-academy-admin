<script setup lang="ts">
// DESIGN.md 5.15 - state what's missing and the one action that fixes it.
// Never apologise (section 6).
defineProps<{
  icon?: string
  message: string
  actionLabel?: string
  actionTo?: string
}>()

defineEmits<{ action: [] }>()
</script>

<template>
  <div class="flex flex-col items-center justify-center rounded-lg bg-surface px-6 py-16 shadow-card">
    <span
      class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brass-tint text-brass-dark"
    >
      <AppIcon :name="icon ?? 'inbox'" :size="24" />
    </span>
    <p class="max-w-sm text-center text-body text-ink-secondary">{{ message }}</p>
    <NuxtLink
      v-if="actionLabel && actionTo"
      :to="actionTo"
      class="mt-5 flex h-10 items-center rounded-md bg-brass px-4 text-body font-medium text-white transition-colors hover:bg-brass-dark"
    >{{ actionLabel }}</NuxtLink>
    <AppButton
      v-else-if="actionLabel"
      class="mt-5"
      @click="$emit('action')"
    >{{ actionLabel }}</AppButton>
  </div>
</template>
