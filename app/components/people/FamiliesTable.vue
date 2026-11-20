<script setup lang="ts">
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'
import type { DataTableColumn } from '~/types/table'

defineProps<{ total?: number }>()
const emit = defineEmits<{ select: [userId: Id<'users'>] }>()

const pageSize = 8
const { page, rows, isPending, goTo } = useCursorPages(api.people.listFamilies, pageSize)

type Row = (typeof rows.value)[number]

const columns: DataTableColumn<Row>[] = [
  { key: 'parentName', label: 'Parent' },
  { key: 'children', label: 'Students', value: (row) => row.children.join(', ') },
  { key: 'actions', label: '', width: 'w-28', align: 'end' },
]
</script>

<template>
  <DataTable
    :columns="columns"
    :rows="rows"
    :row-key="(row) => row.id"
    :page="page"
    :page-size="pageSize"
    :total="total"
    :loading="isPending"
    caption="Parents and the students linked to them"
    empty-icon="users"
    empty-message="No families linked yet. Link a parent to a student to see them here."
    @update:page="goTo"
  >
    <template #cell-parentName="{ row }">
      <button
        type="button"
        class="flex items-center gap-3 text-left font-medium text-ink transition-colors hover:text-brass hover:underline"
        @click="emit('select', row.id)"
      >
        <AppAvatar :name="row.parentName" :size="28" />
        <span>{{ row.parentName }}</span>
      </button>
    </template>

    <template #cell-actions="{ row }">
      <button
        type="button"
        class="rounded-md px-2 py-1 text-caption font-medium text-brass transition-colors hover:bg-page"
        @click="emit('select', row.id)"
      >
        Profile
      </button>
    </template>
  </DataTable>
</template>
