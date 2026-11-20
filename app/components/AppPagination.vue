<script setup lang="ts">
// DESIGN.md 5.16 - Inter 13/18, secondary page count, icon buttons for
// prev/next, current page in primary 600.
const props = defineProps<{
  page: number
  pageSize: number
  total: number
}>()

const emit = defineEmits<{ 'update:page': [page: number] }>()

const range = computed(() => pageRange(props.page, props.pageSize, props.total))

const go = (page: number) => emit('update:page', clampPage(page, range.value.lastPage))

const format = (value: number) => value.toLocaleString('en-GB')
</script>

<template>
  <div class="flex items-center justify-between gap-4 text-caption text-ink-secondary">
    <p>
      Showing {{ format(range.first) }}–{{ format(range.last) }} of {{ format(total) }}
    </p>

    <div class="flex items-center gap-2">
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-page disabled:cursor-not-allowed disabled:text-ink-disabled disabled:hover:bg-transparent"
        :disabled="!range.hasPrevious"
        aria-label="Previous page"
        @click="go(page - 1)"
      >
        <AppIcon name="chevronLeft" :size="18" />
      </button>

      <p>
        Page <span class="font-semibold text-ink">{{ format(page) }}</span> of
        {{ format(range.lastPage) }}
      </p>

      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-page disabled:cursor-not-allowed disabled:text-ink-disabled disabled:hover:bg-transparent"
        :disabled="!range.hasNext"
        aria-label="Next page"
        @click="go(page + 1)"
      >
        <AppIcon name="chevronRight" :size="18" />
      </button>
    </div>
  </div>
</template>
