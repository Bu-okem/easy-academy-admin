<script setup lang="ts">
// DESIGN.md 5.3 - Fraunces title, caption below, 24px gap before content.
defineProps<{ title: string; caption?: string }>()
</script>

<template>
  <header class="mb-6">
    <h1 class="font-display text-greeting font-medium text-ink">{{ title }}</h1>
    <p v-if="caption" class="mt-1 text-caption text-ink-secondary">{{ caption }}</p>
  </header>
</template>
