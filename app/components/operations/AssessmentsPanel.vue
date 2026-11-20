<script setup lang="ts">
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'

type MarkStatus = 'present' | 'absent' | 'excused' | 'incomplete'

const markStatuses: { value: MarkStatus; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'excused', label: 'Excused' },
  { value: 'incomplete', label: 'Incomplete' },
]

const selectedAssignmentId = ref('')
const selectedAssessmentId = ref('')

const { data: sheet, isPending } = useConvexQuery(
  api.marks.sheet,
  computed(() => ({
    assignmentId: selectedAssignmentId.value === ''
      ? undefined
      : (selectedAssignmentId.value as Id<'teachingAssignments'>),
    assessmentId: selectedAssessmentId.value === ''
      ? undefined
      : (selectedAssessmentId.value as Id<'assessments'>),
  }))
)

const { mutate: createAssessment, isPending: creatingAssessment } = useConvexMutation(
  api.marks.createAssessment
)
const { mutate: recordBatch, isPending: savingMarks } = useConvexMutation(api.marks.recordBatch)

const assignmentOptions = computed(() =>
  (sheet.value?.assignments ?? []).map((a) => ({
    value: a.id,
    label: `${a.sectionName} · ${a.subjectName} (${a.teacherName})`,
  }))
)

const assessmentOptions = computed(() =>
  (sheet.value?.assessments ?? []).map((a) => ({
    value: a.id,
    label: `${a.name} (${Math.round(a.weight * 100)}% · /${a.maxScore})`,
  }))
)

watch(selectedAssignmentId, () => {
  selectedAssessmentId.value = ''
})

watch(sheet, (value) => {
  if (!value) return
  if (value.selectedAssignment && selectedAssignmentId.value === '') {
    selectedAssignmentId.value = value.selectedAssignment.id
  }
  if (value.selectedAssessment && selectedAssessmentId.value === '') {
    selectedAssessmentId.value = value.selectedAssessment.id
  }
})

const remainingWeightPercent = computed(() => {
  const used = (sheet.value?.assessments ?? []).reduce((sum, item) => sum + item.weight, 0)
  return Math.max(0, Math.round((1 - used) * 100))
})

// --- Mark entry state -------------------------------------------------------
const entries = ref<Record<string, { status: MarkStatus; score: string }>>({})
const problem = ref<string | null>(null)
const saved = ref<string | null>(null)

watch(
  () => [sheet.value?.selectedAssessment?.id, sheet.value?.students] as const,
  ([, students]) => {
    problem.value = null
    saved.value = null
    if (!students) {
      entries.value = {}
      return
    }
    const next: Record<string, { status: MarkStatus; score: string }> = {}
    for (const student of students) {
      if (student.status) {
        next[student.studentId] = {
          status: student.status,
          score: student.score !== null ? String(student.score) : '',
        }
      }
    }
    entries.value = next
  },
  { immediate: true }
)

function setStatus(studentId: string, status: MarkStatus) {
  const existing = entries.value[studentId]
  entries.value[studentId] = {
    status,
    score: status === 'present' ? (existing?.score ?? '') : '',
  }
}

function setScore(studentId: string, raw: string) {
  entries.value[studentId] = {
    status: 'present',
    score: raw,
  }
}

const enteredCount = computed(() => Object.keys(entries.value).length)

function messageFrom(error: unknown, fallback: string): string {
  const data = (error as { data?: unknown })?.data
  if (data && typeof data === 'object' && 'message' in data) return String(data.message)
  return fallback
}

async function saveMarks() {
  const assessment = sheet.value?.selectedAssessment
  if (!assessment || enteredCount.value === 0) return
  problem.value = null
  saved.value = null

  const payload: {
    studentId: Id<'students'>
    status: MarkStatus
    score?: number
  }[] = []

  for (const [studentId, entry] of Object.entries(entries.value)) {
    if (entry.status === 'present') {
      const trimmed = entry.score.trim()
      if (trimmed === '') {
        payload.push({ studentId: studentId as Id<'students'>, status: 'present', score: undefined })
        continue
      }
      const parsed = Number(trimmed)
      if (!Number.isFinite(parsed)) {
        problem.value = `"${trimmed}" is not a valid numeric score.`
        return
      }
      payload.push({ studentId: studentId as Id<'students'>, status: 'present', score: parsed })
    } else {
      payload.push({ studentId: studentId as Id<'students'>, status: entry.status, score: undefined })
    }
  }

  try {
    const result = await recordBatch({
      assessmentId: assessment.id,
      entries: payload,
    })
    saved.value = `${result.recorded} recorded, ${result.corrected} corrected.`
  } catch (error) {
    problem.value = messageFrom(error, 'The marks could not be saved. Please try again.')
  }
}

// --- Add assessment modal ---------------------------------------------------
const assessmentDialog = ref(false)
const assessmentName = ref('')
const assessmentWeight = ref('')
const assessmentMaxScore = ref('100')
const assessmentProblem = ref<string | null>(null)

watch(assessmentDialog, (open) => {
  if (!open) return
  assessmentName.value = ''
  assessmentWeight.value = remainingWeightPercent.value > 0 ? String(remainingWeightPercent.value) : ''
  assessmentMaxScore.value = '100'
  assessmentProblem.value = null
})

async function submitAssessment() {
  const assignment = sheet.value?.selectedAssignment
  if (!assignment) return
  assessmentProblem.value = null

  const weightPercent = Number(assessmentWeight.value)
  const maxScore = Number(assessmentMaxScore.value)
  if (!Number.isFinite(weightPercent) || !Number.isFinite(maxScore)) {
    assessmentProblem.value = 'Weight and maximum score must be numbers.'
    return
  }

  try {
    const created = await createAssessment({
      assignmentId: assignment.id,
      name: assessmentName.value,
      weightPercent,
      maxScore,
    })
    selectedAssessmentId.value = created.id
    assessmentDialog.value = false
  } catch (error) {
    assessmentProblem.value = messageFrom(error, 'The assessment could not be added. Please try again.')
  }
}
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div class="flex flex-wrap items-end gap-4">
        <div class="w-80">
          <AppSelect
            v-model="selectedAssignmentId"
            label="Subject & class"
            placeholder="Choose a teaching assignment"
            :options="assignmentOptions"
            :disabled="assignmentOptions.length === 0"
          />
        </div>
        <div class="w-64">
          <AppSelect
            v-model="selectedAssessmentId"
            label="Assessment"
            placeholder="Choose an assessment"
            :options="assessmentOptions"
            :disabled="assessmentOptions.length === 0"
          />
        </div>
      </div>

      <AppButton
        variant="secondary"
        :disabled="!sheet?.selectedAssignment"
        @click="assessmentDialog = true"
      >
        Add assessment
      </AppButton>
    </div>

    <div v-if="isPending" class="h-64 animate-pulse rounded-lg bg-surface shadow-card" aria-busy="true" />

    <EmptyState
      v-else-if="!sheet"
      icon="calendar"
      message="No academic year is active yet. Create one and mark it active to record marks."
    />

    <EmptyState
      v-else-if="sheet.assignments.length === 0"
      icon="board"
      message="No teaching assignments exist for this term yet. Assign a teacher to a class to create assessments."
    />

    <EmptyState
      v-else-if="!sheet.selectedAssessment"
      icon="clipboard"
      message="No assessments exist for this subject yet. Add one to start recording student marks."
      action-label="Add assessment"
      @action="assessmentDialog = true"
    />

    <EmptyState
      v-else-if="sheet.students.length === 0"
      icon="users"
      message="Nobody is enrolled in this class yet, so there are no marks to enter."
    />

    <div v-else class="rounded-lg bg-surface shadow-card">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-6 py-4">
        <div>
          <p class="text-body font-medium text-ink">
            {{ sheet.selectedAssessment.name }} · {{ Math.round(sheet.selectedAssessment.weight * 100) }}% weight
          </p>
          <p class="text-caption text-ink-secondary">
            Marked out of {{ sheet.selectedAssessment.maxScore }} · {{ enteredCount }} of {{ sheet.students.length }} entered
          </p>
        </div>

        <AppButton :disabled="savingMarks || enteredCount === 0" @click="saveMarks">
          {{ savingMarks ? 'Saving…' : 'Save marks' }}
        </AppButton>
      </div>

      <p v-if="problem" class="border-b border-hairline bg-negative-bg px-6 py-3 text-body text-negative-text">
        {{ problem }}
      </p>
      <p v-if="saved" class="border-b border-hairline bg-positive-bg px-6 py-3 text-body text-positive-text">
        Marks saved. {{ saved }}
      </p>

      <ul>
        <li
          v-for="student in sheet.students"
          :key="student.studentId"
          class="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-6 py-3 last:border-b-0"
        >
          <span class="flex items-center gap-3">
            <AppAvatar :name="student.fullName" :size="28" />
            <span class="text-body font-medium text-ink">{{ student.fullName }}</span>
          </span>

          <div class="flex flex-wrap items-center gap-3">
            <span class="flex items-center gap-1" role="group" :aria-label="`Mark status for ${student.fullName}`">
              <button
                v-for="option in markStatuses"
                :key="option.value"
                type="button"
                class="rounded-full px-3 py-1 text-caption font-medium transition-colors"
                :class="
                  entries[student.studentId]?.status === option.value
                    ? 'bg-brass text-white'
                    : 'text-ink-secondary hover:bg-page'
                "
                :aria-pressed="entries[student.studentId]?.status === option.value"
                @click="setStatus(student.studentId, option.value)"
              >{{ option.label }}</button>
            </span>

            <div class="flex items-center gap-1.5">
              <input
                :value="entries[student.studentId]?.score ?? ''"
                type="number"
                step="any"
                min="0"
                :max="sheet.selectedAssessment.maxScore"
                :disabled="
                  entries[student.studentId] !== undefined &&
                  entries[student.studentId]!.status !== 'present'
                "
                :aria-label="`Score for ${student.fullName}`"
                placeholder="—"
                class="h-9 w-20 rounded-sm border border-hairline bg-surface px-2.5 text-right text-body text-ink placeholder:text-ink-disabled disabled:bg-page disabled:text-ink-disabled"
                @input="setScore(student.studentId, ($event.target as HTMLInputElement).value)"
              >
              <span class="w-10 text-caption text-ink-secondary">
                / {{ sheet.selectedAssessment.maxScore }}
              </span>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <AppModal v-model:open="assessmentDialog" title="Add assessment">
      <form class="flex flex-col gap-4" @submit.prevent="submitAssessment">
        <AppInput
          v-model="assessmentName"
          label="Name"
          placeholder="Mid-term test"
        />
        <AppInput
          v-model="assessmentWeight"
          label="Weight (%)"
          placeholder="40"
          :hint="`Total weight for this subject cannot exceed 100%. ${remainingWeightPercent}% remaining.`"
        />
        <AppInput
          v-model="assessmentMaxScore"
          label="Maximum score"
          placeholder="100"
        />
        <p
          v-if="assessmentProblem"
          class="rounded-sm bg-negative-bg px-3 py-2 text-caption text-negative-text"
        >
          {{ assessmentProblem }}
        </p>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="assessmentDialog = false">Cancel</AppButton>
        <AppButton
          :disabled="
            creatingAssessment ||
            assessmentName.trim() === '' ||
            assessmentWeight.trim() === '' ||
            assessmentMaxScore.trim() === ''
          "
          @click="submitAssessment"
        >
          {{ creatingAssessment ? 'Adding…' : 'Add assessment' }}
        </AppButton>
      </template>
    </AppModal>
  </div>
</template>
