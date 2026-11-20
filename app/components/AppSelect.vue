<script setup lang="ts">
// DESIGN.md 5.8 - same shell as the text input, chevron right-aligned.
defineProps<{
  label: string
  options: ReadonlyArray<{ value: string; label: string }>
  /** Shown as a disabled first option when nothing is chosen yet. */
  placeholder?: string
  disabled?: boolean
}>()

const model = defineModel<string>({ required: true })
const id = useId()
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="text-caption font-medium text-ink-secondary">{{ label }}</label>

    <div class="relative">
      <select
        :id="id"
        v-model="model"
        :disabled="disabled"
        class="h-10 w-full appearance-none rounded-sm border border-hairline bg-surface pl-3 pr-9 text-body text-ink disabled:cursor-not-allowed disabled:text-ink-disabled"
      >
        <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>

      <AppIcon
        name="chevronDown"
        :size="16"
        class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-secondary"
      />
    </div>
  </div>
</template>
