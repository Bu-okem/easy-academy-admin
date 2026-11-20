<script setup lang="ts" generic="T">
import type { DataTableColumn } from '~/types/table'

// DESIGN.md 5.9. Pagination is controlled from outside rather than held here,
// because the rows come from a paged Convex query - a table that tracked its
// own page would immediately disagree with the data it was showing.
const props = withDefaults(
  defineProps<{
    columns: readonly DataTableColumn<T>[]
    rows: readonly T[]
    /** Stable identity per row; `_id` once these come from Convex. */
    rowKey: (row: T) => string
    /** Describes the table to screen readers. */
    caption: string
    /** Shown in place of the table when there is nothing to list (5.15). */
    emptyMessage: string
    emptyIcon?: string
    page?: number
    pageSize?: number
    /** Total across all pages. Omit to hide the pagination footer entirely. */
    total?: number
    /** While true, shows placeholder rows rather than the empty state. */
    loading?: boolean
  }>(),
  { page: 1, pageSize: 25 }
)

defineEmits<{ 'update:page': [page: number] }>()

const slots = useSlots()

// An empty table mid-load is not an empty table; saying "no students yet"
// before the first page arrives would be wrong, not just early.
const isEmpty = computed(() => props.rows.length === 0 && !props.loading)
const showFooter = computed(() => props.total !== undefined && !isEmpty.value)
const placeholderRows = computed(() =>
  props.loading && props.rows.length === 0 ? Math.min(props.pageSize, 8) : 0
)

const cellText = (row: T, column: DataTableColumn<T>) => {
  const value = column.value
    ? column.value(row)
    : (row as Record<string, unknown>)[column.key]
  return value === null || value === undefined || value === '' ? '—' : String(value)
}

const alignment = (column: DataTableColumn<T>) =>
  column.align === 'end' ? 'text-right' : 'text-left'
</script>

<template>
  <div class="rounded-lg bg-surface shadow-card">
    <EmptyState v-if="isEmpty" :icon="emptyIcon" :message="emptyMessage" />

    <template v-else>
      <!-- Only the table scrolls sideways on a narrow viewport; the page never does. -->
      <div class="overflow-x-auto">
        <table class="w-full border-collapse text-body">
          <caption class="sr-only">{{ caption }}</caption>

          <thead>
            <tr class="border-b border-hairline">
              <th
                v-for="column in columns"
                :key="column.key"
                scope="col"
                class="whitespace-nowrap px-6 py-3 text-caption font-semibold text-ink-secondary"
                :class="[alignment(column), column.width]"
              >{{ column.label }}</th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="n in placeholderRows"
              :key="`placeholder-${n}`"
              class="border-b border-hairline last:border-b-0"
            >
              <td v-for="column in columns" :key="column.key" class="h-12 px-6">
                <span class="block h-3 w-24 animate-pulse rounded-full bg-page" />
              </td>
            </tr>

            <tr
              v-for="row in rows"
              :key="rowKey(row)"
              class="border-b border-hairline transition-colors last:border-b-0 hover:bg-page"
            >
              <td
                v-for="column in columns"
                :key="column.key"
                class="h-12 px-6 text-ink"
                :class="alignment(column)"
              >
                <slot
                  v-if="slots[`cell-${column.key}`]"
                  :name="`cell-${column.key}`"
                  :row="row"
                />
                <template v-else>{{ cellText(row, column) }}</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer v-if="showFooter" class="border-t border-hairline px-6 py-3">
        <AppPagination
          :page="page"
          :page-size="pageSize"
          :total="total!"
          @update:page="$emit('update:page', $event)"
        />
      </footer>
    </template>
  </div>
</template>
