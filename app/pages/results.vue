<script setup lang="ts">
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'
import type { DataTableColumn } from '~/types/table'

const selectedSection = ref<string>('')
const { can } = useViewer()

const { data: sections } = useConvexQuery(api.timetable.sections)
const { data: results, isPending } = useConvexQuery(
  api.results.forClass,
  computed(() => ({
    classSectionId: selectedSection.value === ''
      ? undefined
      : (selectedSection.value as Id<'classSections'>),
  }))
)

const { mutate: calculate } = useConvexMutation(api.results.calculate)
const { mutate: publish } = useConvexMutation(api.results.publish)
const { mutate: withdraw } = useConvexMutation(api.results.withdraw)

const sectionOptions = computed(() =>
  (sections.value ?? []).map((section) => ({ value: section.id, label: section.name }))
)

watch(results, (value) => {
  if (value && selectedSection.value === '') selectedSection.value = value.section.id
})

type Row = NonNullable<typeof results.value>['rows'][number]

const columns: DataTableColumn<Row>[] = [
  { key: 'fullName', label: 'Student' },
  { key: 'subjects', label: 'Subjects', width: 'w-24', align: 'end' },
  { key: 'termGpa', label: 'GPA', width: 'w-20', align: 'end' },
  { key: 'attendance', label: 'Present / absent', width: 'w-36', align: 'end' },
  { key: 'isPublished', label: 'Status', width: 'w-28' },
  { key: 'actions', label: '', width: 'w-72', align: 'end' },
]

/** Whichever row is mid-request, so only its own buttons go quiet. */
const busy = ref<string | null>(null)
const problem = ref<string | null>(null)

function messageFrom(error: unknown): string {
  const data = (error as { data?: unknown })?.data
  if (data && typeof data === 'object' && 'message' in data) return String(data.message)
  return 'That could not be done. Please try again.'
}

async function run(row: Row, action: () => Promise<unknown>) {
  busy.value = row.studentId
  problem.value = null
  try {
    await action()
  } catch (error) {
    problem.value = `${row.fullName}: ${messageFrom(error)}`
  } finally {
    busy.value = null
  }
}

const calculateFor = (row: Row) => run(row, () => calculate({ studentId: row.studentId }))
const publishFor = (row: Row) =>
  run(row, () => publish({ summaryId: row.summaryId as Id<'termSummaries'> }))
const withdrawFor = (row: Row) =>
  run(row, () => withdraw({ summaryId: row.summaryId as Id<'termSummaries'> }))

/** Calculating the whole class, one student at a time so one failure is visible. */
const calculatingAll = ref(false)
async function calculateAll() {
  if (!results.value) return
  calculatingAll.value = true
  problem.value = null
  try {
    for (const row of results.value.rows) {
      if (row.isPublished) continue
      try {
        await calculate({ studentId: row.studentId })
      } catch (error) {
        problem.value = `${row.fullName}: ${messageFrom(error)}`
      }
    }
  } finally {
    calculatingAll.value = false
  }
}

/** Publishing every calculated, unpublished report card in the selected class. */
const publishingAll = ref(false)
const hasPublishable = computed(
  () => results.value?.rows.some((row) => row.summaryId !== null && !row.isPublished) ?? false
)
async function publishAll() {
  if (!results.value) return
  publishingAll.value = true
  problem.value = null
  try {
    for (const row of results.value.rows) {
      if (!row.summaryId || row.isPublished) continue
      try {
        await publish({ summaryId: row.summaryId })
      } catch (error) {
        problem.value = `${row.fullName}: ${messageFrom(error)}`
      }
    }
  } finally {
    publishingAll.value = false
  }
}

// --- Report card detail modal -----------------------------------------------
const reportStudentId = ref<Id<'students'> | null>(null)
const reportOpen = ref(false)

function openReportCard(row: Row) {
  reportStudentId.value = row.studentId
  reportOpen.value = true
}

watch(reportOpen, (isOpen) => {
  if (!isOpen) reportStudentId.value = null
})

useHead({ title: 'Results' })
</script>

<template>
  <div>
    <PageHeader
      title="Results"
      :caption="results ? `${results.section.name} · ${results.term.name}` : 'Term results, report cards and publishing'"
    />

    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div class="w-full max-w-xs">
        <AppSelect
          v-model="selectedSection"
          label="Class section"
          placeholder="Choose a class"
          :options="sectionOptions"
        />
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <AppButton
          v-if="can('results.calculate')"
          variant="secondary"
          :disabled="calculatingAll || publishingAll || !results"
          @click="calculateAll"
        >
          {{ calculatingAll ? 'Calculating…' : 'Calculate whole class' }}
        </AppButton>
        <AppButton
          v-if="can('results.publish')"
          :disabled="publishingAll || calculatingAll || !hasPublishable"
          @click="publishAll"
        >
          {{ publishingAll ? 'Publishing…' : 'Publish whole class' }}
        </AppButton>
      </div>
    </div>

    <p
      v-if="problem"
      class="mb-4 rounded-sm bg-negative-bg px-4 py-3 text-body text-negative-text"
    >{{ problem }}</p>

    <DataTable
      :columns="columns"
      :rows="results?.rows ?? []"
      :row-key="(row) => row.studentId"
      :loading="isPending"
      caption="Report cards for the class"
      empty-icon="award"
      empty-message="No students are enrolled in this class, so there is nothing to report on."
    >
      <template #cell-fullName="{ row }">
        <span class="flex items-center gap-3">
          <AppAvatar :name="row.fullName" :size="28" />
          <span class="font-medium">{{ row.fullName }}</span>
        </span>
      </template>

      <template #cell-termGpa="{ row }">
        <span v-if="row.termGpa !== null" class="font-display font-semibold">{{ row.termGpa }}</span>
        <span v-else class="text-ink-secondary">—</span>
      </template>

      <template #cell-attendance="{ row }">
        <span v-if="row.daysPresent !== null" class="text-ink">
          {{ row.daysPresent }} / {{ row.daysAbsent }}
        </span>
        <span v-else class="text-ink-secondary">—</span>
      </template>

      <template #cell-isPublished="{ row }">
        <StatusBadge :status="row.isPublished ? 'published' : 'draft'" />
      </template>

      <template #cell-actions="{ row }">
        <span class="flex items-center justify-end gap-3">
          <button
            type="button"
            class="rounded-md px-2 py-1 text-caption font-medium text-ink transition-colors hover:bg-page"
            @click="openReportCard(row)"
          >Report card</button>

          <button
            v-if="can('results.calculate') && !row.isPublished"
            type="button"
            class="rounded-md px-2 py-1 text-caption font-medium text-brass transition-colors hover:bg-page disabled:text-ink-disabled"
            :disabled="busy === row.studentId"
            @click="calculateFor(row)"
          >{{ row.summaryId ? 'Recalculate' : 'Calculate' }}</button>

          <button
            v-if="can('results.publish') && row.summaryId && !row.isPublished"
            type="button"
            class="rounded-md px-2 py-1 text-caption font-medium text-brass transition-colors hover:bg-page disabled:text-ink-disabled"
            :disabled="busy === row.studentId"
            @click="publishFor(row)"
          >Publish</button>

          <button
            v-if="can('results.publish') && row.isPublished"
            type="button"
            class="rounded-md px-2 py-1 text-caption font-medium text-ink-secondary transition-colors hover:bg-page disabled:text-ink-disabled"
            :disabled="busy === row.studentId"
            @click="withdrawFor(row)"
          >Withdraw</button>
        </span>
      </template>
    </DataTable>

    <ResultsReportCardDialog
      v-if="reportStudentId"
      v-model:open="reportOpen"
      :student-id="reportStudentId"
    />
  </div>
</template>
