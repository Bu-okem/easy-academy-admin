<script setup lang="ts">
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'

const props = defineProps<{
  student: {
    fullName: string
    studentId: Id<'students'> | null
    classSectionId: Id<'classSections'> | null
    attendance: 'present' | 'absent' | 'late' | 'excused' | null
  } | null
}>()

const open = defineModel<boolean>('open', { required: true })

const { data: calendar } = useConvexQuery(api.calendar.active)
const { data: teachers } = useConvexQuery(api.people.teacherOptions)
const { mutate, isPending } = useConvexMutation(api.attendance.record)

// Labels mirror the schema's own vocabulary (docs/DESIGN.md section 6).
const statuses = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'late', label: 'Late' },
  { value: 'excused', label: 'Excused' },
]

const status = ref('')
const teacherId = ref('')
const remarks = ref('')
const problem = ref<string | null>(null)

const teacherOptions = computed(() =>
  (teachers.value ?? []).map((teacher) => ({ value: teacher.id, label: teacher.name }))
)

// Reopening for a different student must not inherit the previous one's answers.
watch(
  () => [open.value, props.student?.studentId] as const,
  ([isOpen]) => {
    if (!isOpen) return
    status.value = props.student?.attendance ?? ''
    teacherId.value = ''
    remarks.value = ''
    problem.value = null
  }
)

const canSubmit = computed(
  () =>
    !isPending.value &&
    status.value !== '' &&
    teacherId.value !== '' &&
    props.student?.studentId != null &&
    props.student?.classSectionId != null &&
    calendar.value?.termId != null
)

async function submit() {
  if (!canSubmit.value || !props.student) return
  problem.value = null

  try {
    await mutate({
      studentId: props.student.studentId!,
      classSectionId: props.student.classSectionId!,
      teacherId: teacherId.value as Id<'teachers'>,
      termId: calendar.value!.termId!,
      attendanceDate: new Date().toISOString().slice(0, 10),
      status: status.value as 'present' | 'absent' | 'late' | 'excused',
      remarks: remarks.value.trim() === '' ? undefined : remarks.value.trim(),
    })
    open.value = false
  } catch (error) {
    // The domain's own wording, surfaced verbatim rather than restated here.
    problem.value = messageFrom(error)
  }
}

/** ConvexError carries the domain's message in `data`; anything else is a fault. */
function messageFrom(error: unknown): string {
  const data = (error as { data?: unknown })?.data
  if (data && typeof data === 'object' && 'message' in data) return String(data.message)
  return 'That could not be saved. Please try again.'
}
</script>

<template>
  <AppModal v-model:open="open" :title="`Attendance for ${student?.fullName ?? 'student'}`">
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <p class="text-caption text-ink-secondary">
        Recording for today. A student can hold only one status per day, so this
        replaces any entry already taken.
      </p>

      <AppSelect
        v-model="status"
        label="Status"
        placeholder="Choose a status"
        :options="statuses"
      />

      <AppSelect
        v-model="teacherId"
        label="Recorded by"
        placeholder="Choose a teacher"
        :options="teacherOptions"
      />

      <AppInput
        v-model="remarks"
        label="Remarks"
        placeholder="Optional"
        hint="Shown alongside the register entry."
      />

      <p v-if="problem" class="rounded-sm bg-negative-bg px-3 py-2 text-caption text-negative-text">
        {{ problem }}
      </p>
    </form>

    <template #footer>
      <AppButton variant="secondary" @click="open = false">Cancel</AppButton>
      <AppButton :disabled="!canSubmit" @click="submit">
        {{ isPending ? 'Saving…' : 'Save attendance' }}
      </AppButton>
    </template>
  </AppModal>
</template>
