<script setup lang="ts">
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'

const filterSection = ref('')

const { data: sections } = useConvexQuery(api.timetable.sections)
const { data: teachers } = useConvexQuery(api.people.teacherOptions)
const { data: behavior, isPending } = useConvexQuery(
  api.operations.behavior,
  computed(() => ({
    classSectionId: filterSection.value === ''
      ? undefined
      : (filterSection.value as Id<'classSections'>),
  }))
)
const { mutate: logBehavior, isPending: saving } = useConvexMutation(api.operations.logBehavior)

const sectionFilterOptions = computed(() => [
  { value: '', label: 'All classes' },
  ...(sections.value ?? []).map((section) => ({ value: section.id, label: section.name })),
])

const studentOptions = computed(() =>
  (behavior.value?.students ?? []).map((student) => ({
    value: student.id,
    label: `${student.fullName} (${student.sectionName})`,
  }))
)

const teacherOptions = computed(() =>
  (teachers.value ?? []).map((teacher) => ({ value: teacher.id, label: teacher.name }))
)

const typeOptions = [
  { value: 'merit', label: 'Merit' },
  { value: 'demerit', label: 'Demerit' },
]

const severityOptions = [
  { value: '1', label: '1 — Minor' },
  { value: '2', label: '2 — Low' },
  { value: '3', label: '3 — Moderate' },
  { value: '4', label: '4 — High' },
  { value: '5', label: '5 — Serious' },
]

// --- Record behaviour modal -------------------------------------------------
const dialogOpen = ref(false)
const studentId = ref('')
const teacherId = ref('')
const recordType = ref('merit')
const severity = ref('2')
const incidentDate = ref(new Date().toISOString().slice(0, 10))
const description = ref('')
const actionTaken = ref('')
const problem = ref<string | null>(null)

watch(dialogOpen, (open) => {
  if (!open) return
  studentId.value = ''
  teacherId.value = ''
  recordType.value = 'merit'
  severity.value = '2'
  incidentDate.value = new Date().toISOString().slice(0, 10)
  description.value = ''
  actionTaken.value = ''
  problem.value = null
})

function messageFrom(error: unknown): string {
  const data = (error as { data?: unknown })?.data
  if (data && typeof data === 'object' && 'message' in data) return String(data.message)
  return 'That behaviour record could not be saved. Please try again.'
}

const canSubmit = computed(
  () =>
    !saving.value &&
    studentId.value !== '' &&
    teacherId.value !== '' &&
    description.value.trim() !== '' &&
    incidentDate.value.trim() !== ''
)

async function submit() {
  if (!canSubmit.value) return
  problem.value = null
  try {
    await logBehavior({
      studentId: studentId.value as Id<'students'>,
      teacherId: teacherId.value as Id<'teachers'>,
      type: recordType.value as 'merit' | 'demerit',
      severityLevel: Number(severity.value),
      description: description.value,
      incidentDate: incidentDate.value.trim(),
      actionTaken: actionTaken.value.trim() === '' ? undefined : actionTaken.value.trim(),
    })
    dialogOpen.value = false
  } catch (error) {
    problem.value = messageFrom(error)
  }
}
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div class="w-56">
        <AppSelect
          v-model="filterSection"
          label="Class section"
          :options="sectionFilterOptions"
        />
      </div>

      <AppButton :disabled="!behavior || behavior.students.length === 0" @click="dialogOpen = true">
        Record behaviour
      </AppButton>
    </div>

    <div v-if="isPending" class="h-64 animate-pulse rounded-lg bg-surface shadow-card" aria-busy="true" />

    <EmptyState
      v-else-if="!behavior"
      icon="calendar"
      message="No academic year is active yet. Create one and mark it active to record behaviour."
    />

    <EmptyState
      v-else-if="behavior.records.length === 0"
      icon="clipboard"
      message="No merits or demerits recorded for this term yet. Record the first entry to track behaviour."
      :action-label="behavior.students.length > 0 ? 'Record behaviour' : undefined"
      @action="dialogOpen = true"
    />

    <div v-else class="rounded-lg bg-surface shadow-card">
      <ul>
        <li
          v-for="record in behavior.records"
          :key="record.id"
          class="flex flex-wrap items-start justify-between gap-4 border-b border-hairline px-6 py-4 last:border-b-0"
        >
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2.5">
              <StatusBadge :status="record.type" />
              <span class="text-body font-medium text-ink">{{ record.studentName }}</span>
              <span class="text-caption text-ink-secondary">{{ record.sectionName }}</span>
              <span class="rounded-full bg-page px-2 py-0.5 text-badge font-medium text-ink-secondary">
                Severity {{ record.severityLevel }}/5
              </span>
            </div>
            <p class="mt-2 text-body text-ink">{{ record.description }}</p>
            <p v-if="record.actionTaken" class="mt-1 text-caption text-ink-secondary">
              Action taken: {{ record.actionTaken }}
            </p>
          </div>

          <div class="shrink-0 text-right">
            <p class="text-caption font-medium text-ink">
              {{ formatDayMonthYear(record.incidentDate) ?? record.incidentDate }}
            </p>
            <p class="mt-0.5 text-caption text-ink-secondary">{{ record.teacherName }}</p>
          </div>
        </li>
      </ul>
    </div>

    <AppModal v-model:open="dialogOpen" title="Record behaviour">
      <form class="flex flex-col gap-4" @submit.prevent="submit">
        <AppSelect
          v-model="studentId"
          label="Student"
          placeholder="Choose a student"
          :options="studentOptions"
        />
        <AppSelect
          v-model="teacherId"
          label="Observed by"
          placeholder="Choose a teacher"
          :options="teacherOptions"
        />
        <div class="grid grid-cols-2 gap-3">
          <AppSelect v-model="recordType" label="Type" :options="typeOptions" />
          <AppSelect v-model="severity" label="Severity" :options="severityOptions" />
        </div>
        <AppInput v-model="incidentDate" label="Incident date" placeholder="YYYY-MM-DD" />
        <AppInput
          v-model="description"
          label="Description"
          placeholder="What happened?"
        />
        <AppInput
          v-model="actionTaken"
          label="Action taken"
          placeholder="Optional"
        />
        <p v-if="problem" class="rounded-sm bg-negative-bg px-3 py-2 text-caption text-negative-text">
          {{ problem }}
        </p>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="dialogOpen = false">Cancel</AppButton>
        <AppButton :disabled="!canSubmit" @click="submit">
          {{ saving ? 'Recording…' : 'Record behaviour' }}
        </AppButton>
      </template>
    </AppModal>
  </div>
</template>
