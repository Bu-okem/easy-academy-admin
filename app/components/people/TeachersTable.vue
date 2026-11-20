<script setup lang="ts">
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'
import type { DataTableColumn } from '~/types/table'

defineProps<{ total?: number }>()
const emit = defineEmits<{ select: [userId: Id<'users'>] }>()

const pageSize = 8
const { page, rows, isPending, goTo } = useCursorPages(api.people.listTeachers, pageSize)

type Row = (typeof rows.value)[number]

const columns: DataTableColumn<Row>[] = [
  { key: 'fullName', label: 'Teacher' },
  { key: 'specialization', label: 'Specialization', width: 'w-52' },
  { key: 'subjects', label: 'Subjects', width: 'w-60' },
  { key: 'classCount', label: 'Classes', width: 'w-28', align: 'end' },
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
    caption="Teaching staff"
    empty-icon="board"
    empty-message="No teachers yet. Add a teacher to start building the timetable."
    @update:page="goTo"
  >
    <template #cell-fullName="{ row }">
      <button
        type="button"
        class="flex items-center gap-3 text-left font-medium text-ink transition-colors hover:text-brass hover:underline"
        @click="emit('select', row.id)"
      >
        <AppAvatar :name="row.fullName" :size="28" />
        <span>{{ row.fullName }}</span>
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
