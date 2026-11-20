<script setup lang="ts">
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'
import type { DataTableColumn } from '~/types/table'

defineProps<{ total?: number }>()
const emit = defineEmits<{ select: [userId: Id<'users'>] }>()
const { can } = useViewer()

const pageSize = 8
const { page, rows, isPending, goTo } = useCursorPages(api.people.listStudents, pageSize)

type Row = (typeof rows.value)[number]

const columns: DataTableColumn<Row>[] = [
  { key: 'fullName', label: 'Student' },
  { key: 'classSection', label: 'Class', width: 'w-40' },
  {
    key: 'dateOfBirth',
    label: 'Date of birth',
    width: 'w-44',
    value: (row) => (row.dateOfBirth ? formatDayMonthYear(row.dateOfBirth) : null),
  },
  { key: 'attendance', label: 'Today', width: 'w-32' },
  { key: 'actions', label: '', width: 'w-44', align: 'end' },
]

const editing = ref<Row | null>(null)
const dialogOpen = ref(false)

function recordAttendance(row: Row) {
  editing.value = row
  dialogOpen.value = true
}
</script>

<template>
  <div>
    <DataTable
    :columns="columns"
    :rows="rows"
    :row-key="(row) => row.id"
    :page="page"
    :page-size="pageSize"
    :total="total"
    :loading="isPending"
    caption="Enrolled students"
    empty-icon="users"
    empty-message="No students enrolled yet. Import a roster or add the first student to get started."
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

    <template #cell-attendance="{ row }">
      <StatusBadge v-if="row.attendance" :status="row.attendance" />
      <span v-else class="text-ink-secondary">—</span>
    </template>

    <template #cell-actions="{ row }">
      <span class="flex items-center justify-end gap-2">
        <button
          type="button"
          class="rounded-md px-2 py-1 text-caption font-medium text-ink-secondary transition-colors hover:bg-page hover:text-ink"
          @click="emit('select', row.id)"
        >
          Profile
        </button>
        <button
          v-if="can('register.take')"
          type="button"
          class="rounded-md px-2 py-1 text-caption font-medium text-brass transition-colors hover:bg-page"
          @click="recordAttendance(row)"
        >
          {{ row.attendance ? 'Change' : 'Record' }}
        </button>
      </span>
    </template>
  </DataTable>

    <PeopleRecordAttendanceDialog v-model:open="dialogOpen" :student="editing" />
  </div>
</template>
