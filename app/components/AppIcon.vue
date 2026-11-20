<script setup lang="ts">
// Line icons, 1.5px stroke, 20px default, rounded joins (DESIGN.md section 4).
// Inline rather than fetched so stroke weight stays exact and the shell renders
// with no network round-trip.
const paths: Record<string, string> = {
  search: 'M9 3a6 6 0 1 0 0 12A6 6 0 0 0 9 3ZM13.5 13.5 17 17',
  bell: 'M10 3a5 5 0 0 0-5 5c0 2.5-.5 3.8-1.2 4.7-.3.4 0 1 .5 1h11.4c.5 0 .8-.6.5-1C15.5 11.8 15 10.5 15 8a5 5 0 0 0-5-5ZM8.2 15.5a2 2 0 0 0 3.6 0',
  chevronDown: 'm5 8 5 5 5-5',
  close: 'M5.5 5.5l9 9M14.5 5.5l-9 9',
  chevronLeft: 'm12 5-5 5 5 5',
  chevronRight: 'm8 5 5 5-5 5',
  users: 'M13 16v-1.5a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3V16M7.5 8.5a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM18 16v-1.5a3 3 0 0 0-2.2-2.9M13.2 3.2a3 3 0 0 1 0 5.6',
  board: 'M3 4h14M4 4v8.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V4M10 13.5V17M10 17l-2.5 1M10 17l2.5 1M7.5 10.5l2-2.5 1.5 1.5 2-3',
  checkCircle: 'M17 9.3V10a7 7 0 1 1-4.2-6.4M7 9.5l2.5 2.5L17.5 4',
  calendar: 'M4.5 4.5h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1ZM7 2.5v4M13 2.5v4M3.5 8.5h13',
  clipboard: 'M7.5 3.5h-2a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-11a1 1 0 0 0-1-1h-2M7.5 3.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1h-5v-1ZM7 9.5h6M7 12.5h4',
  award: 'M10 12a4.25 4.25 0 1 0 0-8.5A4.25 4.25 0 0 0 10 12ZM7 11.3 6 17.5l4-2 4 2-1-6.2',
  inbox: 'M3.5 11.5h3l1 2h5l1-2h3M3.5 11.5 5.2 4.9a1 1 0 0 1 1-.75h7.6a1 1 0 0 1 1 .75l1.7 6.6M3.5 11.5v3.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3.5',
  alert: 'M10 7v3.5M10 13.2v.1M8.7 3.6 2.5 14.2a1.5 1.5 0 0 0 1.3 2.3h12.4a1.5 1.5 0 0 0 1.3-2.3L11.3 3.6a1.5 1.5 0 0 0-2.6 0Z',
}

const props = withDefaults(defineProps<{ name: keyof typeof paths | string; size?: number }>(), {
  size: 20,
})

const d = computed(() => paths[props.name] ?? '')
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="d" />
  </svg>
</template>
