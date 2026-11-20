<script setup lang="ts">
// DESIGN.md 5.12 - underline style, 16px gap, sits directly under a header.
// Implements the ARIA tabs pattern: arrow keys move between tabs, and only the
// active tab is in the page's tab order.
export interface TabDefinition {
  key: string
  label: string
}

const props = defineProps<{
  tabs: readonly TabDefinition[]
  modelValue: string
  /** Names the tab set for screen readers, e.g. "People categories". */
  label: string
  /** Prefixes generated tab ids so a panel can point back with aria-labelledby. */
  idPrefix: string
}>()

const emit = defineEmits<{ 'update:modelValue': [key: string] }>()

const tabId = (key: string) => `${props.idPrefix}-tab-${key}`

const buttons = ref<HTMLButtonElement[]>([])

function select(key: string) {
  emit('update:modelValue', key)
}

/** Arrow keys wrap around; Home and End jump to the ends. */
function onKeydown(event: KeyboardEvent, index: number) {
  const offsets: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 }
  let next: number

  if (event.key in offsets) {
    next = (index + offsets[event.key]! + props.tabs.length) % props.tabs.length
  } else if (event.key === 'Home') {
    next = 0
  } else if (event.key === 'End') {
    next = props.tabs.length - 1
  } else {
    return
  }

  event.preventDefault()
  select(props.tabs[next]!.key)
  nextTick(() => buttons.value[next]?.focus())
}
</script>

<template>
  <div role="tablist" :aria-label="label" class="flex gap-4 border-b border-hairline">
    <button
      v-for="(tab, index) in tabs"
      :key="tab.key"
      :ref="(el) => { if (el) buttons[index] = el as HTMLButtonElement }"
      type="button"
      role="tab"
      :id="tabId(tab.key)"
      :aria-selected="tab.key === modelValue"
      :tabindex="tab.key === modelValue ? 0 : -1"
      class="-mb-px border-b-2 pb-3 pt-1 text-body font-medium transition-colors"
      :class="
        tab.key === modelValue
          ? 'border-brass text-ink'
          : 'border-transparent text-ink-secondary hover:text-ink'
      "
      @click="select(tab.key)"
      @keydown="onKeydown($event, index)"
    >{{ tab.label }}</button>
  </div>
</template>
