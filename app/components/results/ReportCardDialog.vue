<script setup lang="ts">
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'

const props = defineProps<{
  studentId: Id<'students'>
}>()

const open = defineModel<boolean>('open', { required: true })

const { data: card, isPending } = useConvexQuery(
  api.results.reportCard,
  computed(() => ({ studentId: props.studentId }))
)
const { mutate: saveRemarks, isPending: saving } = useConvexMutation(api.results.saveRemarks)

const formTeacherRemark = ref('')
const principalRemark = ref('')
const subjectRemarks = ref<Record<string, string>>({})
const problem = ref<string | null>(null)
const saved = ref(false)

watch(
  card,
  (value) => {
    if (!value) return
    formTeacherRemark.value = value.formTeacherRemark ?? ''
    principalRemark.value = value.principalRemark ?? ''
    const next: Record<string, string> = {}
    for (const subject of value.subjects) {
      next[subject.resultId] = subject.teacherRemark ?? ''
    }
    subjectRemarks.value = next
    problem.value = null
    saved.value = false
  },
  { immediate: true }
)

function messageFrom(error: unknown): string {
  const data = (error as { data?: unknown })?.data
  if (data && typeof data === 'object' && 'message' in data) return String(data.message)
  return 'The remarks could not be saved. Please try again.'
}

const canSaveAny = computed(
  () =>
    Boolean(card.value) &&
    !card.value!.isPublished &&
    (card.value!.permissions.formTeacher || card.value!.permissions.principal)
)

async function submit() {
  if (!card.value || card.value.isPublished) return
  problem.value = null
  saved.value = false

  try {
    await saveRemarks({
      studentId: props.studentId,
      formTeacherRemark: formTeacherRemark.value,
      ...(card.value.permissions.principal
        ? { principalRemark: principalRemark.value }
        : {}),
      subjectRemarks: card.value.subjects.map((subject) => ({
        resultId: subject.resultId,
        teacherRemark: subjectRemarks.value[subject.resultId] ?? '',
      })),
    })
    saved.value = true
  } catch (error) {
    problem.value = messageFrom(error)
  }
}

const title = computed(() =>
  card.value ? `Report card · ${card.value.studentName}` : 'Report card'
)
</script>

<template>
  <AppModal v-model:open="open" :title="title" wide>
    <div v-if="isPending" class="h-48 animate-pulse rounded-sm bg-page" aria-busy="true" />

    <p v-else-if="!card" class="text-body text-ink-secondary">
      This report card is not available.
    </p>

    <div v-else class="flex flex-col gap-5">
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-sm bg-page p-4">
        <div>
          <p class="text-body font-medium text-ink">
            {{ card.sectionName }} · {{ card.termName }}
          </p>
          <p class="mt-0.5 text-caption text-ink-secondary">
            Attendance:
            {{ card.daysPresent ?? '—' }} present / {{ card.daysAbsent ?? '—' }} absent
          </p>
        </div>

        <div class="flex items-center gap-4">
          <div class="text-right">
            <p class="text-badge font-semibold uppercase tracking-wide text-ink-secondary">GPA</p>
            <p class="font-display text-stat-sm font-semibold text-ink">
              {{ card.termGpa ?? '—' }}
            </p>
          </div>
          <StatusBadge :status="card.isPublished ? 'published' : 'draft'" />
        </div>
      </div>

      <div>
        <h3 class="mb-2 text-caption font-semibold uppercase tracking-wide text-ink-secondary">
          Subject results
        </h3>

        <p v-if="card.subjects.length === 0" class="text-body text-ink-secondary">
          No subject results have been calculated yet. You can still save a form teacher or principal remark below before results are calculated.
        </p>

        <ul v-else class="divide-y divide-hairline rounded-sm border border-hairline">
          <li
            v-for="subject in card.subjects"
            :key="subject.resultId"
            class="flex flex-col gap-2 px-4 py-3"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span class="text-body font-medium text-ink">{{ subject.subjectName }}</span>
                <span class="ml-2 text-caption text-ink-secondary">{{ subject.teacherName }}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-body text-ink">{{ subject.cumulativeScore }}%</span>
                <span class="inline-flex min-w-[28px] justify-center rounded-full bg-brass-tint px-2 py-0.5 text-badge font-semibold text-brass-dark">
                  {{ subject.letterGrade }}
                </span>
              </div>
            </div>

            <div v-if="!card.isPublished && card.permissions.teacher">
              <input
                v-model="subjectRemarks[subject.resultId]"
                type="text"
                :aria-label="`Teacher remark for ${subject.subjectName}`"
                placeholder="Teacher remark (optional)"
                class="h-9 w-full rounded-sm border border-hairline bg-surface px-3 text-caption text-ink placeholder:text-ink-disabled"
              >
            </div>
            <p v-else-if="subject.teacherRemark" class="text-caption text-ink-secondary">
              {{ subject.teacherRemark }}
            </p>
          </li>
        </ul>
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AppInput
          v-if="!card.isPublished && card.permissions.formTeacher"
          v-model="formTeacherRemark"
          label="Form teacher remark"
          placeholder="Optional"
        />
        <div v-else class="rounded-sm bg-page p-3">
          <p class="text-caption font-medium text-ink-secondary">Form teacher remark</p>
          <p class="mt-1 text-body text-ink">{{ card.formTeacherRemark ?? '—' }}</p>
        </div>

        <AppInput
          v-if="!card.isPublished && card.permissions.principal"
          v-model="principalRemark"
          label="Principal remark"
          placeholder="Optional"
        />
        <div v-else class="rounded-sm bg-page p-3">
          <p class="text-caption font-medium text-ink-secondary">
            Principal remark
            <span v-if="!card.isPublished && !card.permissions.principal" class="font-normal">
              · Admin only
            </span>
          </p>
          <p class="mt-1 text-body text-ink">{{ card.principalRemark ?? '—' }}</p>
        </div>
      </div>

      <p v-if="problem" class="rounded-sm bg-negative-bg px-3 py-2 text-caption text-negative-text">
        {{ problem }}
      </p>
      <p v-if="saved" class="rounded-sm bg-positive-bg px-3 py-2 text-caption text-positive-text">
        Remarks saved.
      </p>
    </div>

    <template #footer>
      <AppButton variant="secondary" @click="open = false">Close</AppButton>
      <AppButton
        v-if="canSaveAny"
        :disabled="saving"
        @click="submit"
      >
        {{ saving ? 'Saving…' : 'Save remarks' }}
      </AppButton>
    </template>
  </AppModal>
</template>
