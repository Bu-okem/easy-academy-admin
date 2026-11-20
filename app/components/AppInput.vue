<script setup lang="ts">
// DESIGN.md 5.8 - 40px, radius-sm, hairline border, brass focus ring.
defineProps<{
  label: string
  placeholder?: string
  /** Guidance under the field, e.g. what a remark is for. */
  hint?: string
}>()

const model = defineModel<string>({ required: true })
const id = useId()
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="text-caption font-medium text-ink-secondary">{{ label }}</label>
    <input
      :id="id"
      v-model="model"
      type="text"
      :placeholder="placeholder"
      class="h-10 w-full rounded-sm border border-hairline bg-surface px-3 text-body text-ink placeholder:text-ink-disabled"
    >
    <p v-if="hint" class="text-caption text-ink-secondary">{{ hint }}</p>
  </div>
</template>
