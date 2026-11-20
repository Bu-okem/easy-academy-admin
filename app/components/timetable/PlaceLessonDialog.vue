<script setup lang="ts">
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'

const props = defineProps<{
  target: { day: string; periodId: string; periodName: string } | null
  occupied: { id: string; subject: string; teacher: string; classroom: string } | null
  classSectionId: string | null
}>()

const open = defineModel<boolean>('open', { required: true })

const { data: options } = useConvexQuery(api.timetable.placementOptions)
const { mutate: place, isPending: placing } = useConvexMutation(api.timetable.place)
const { mutate: remove, isPending: removing } = useConvexMutation(api.timetable.remove)

const assignmentId = ref('')
const classroomId = ref('')
const problem = ref<string | null>(null)

const assignmentOptions = computed(() =>
  (options.value?.assignments ?? []).map((a) => ({ value: a.id, label: a.label }))
)
const classroomOptions = computed(() =>
  (options.value?.classrooms ?? []).map((room) => ({ value: room.id, label: room.label }))
)

watch(
  () => [open.value, props.target?.periodId, props.target?.day] as const,
  ([isOpen]) => {
    if (!isOpen) return
    assignmentId.value = ''
    classroomId.value = ''
    problem.value = null
  }
)

const canPlace = computed(
  () => !placing.value && assignmentId.value !== '' && classroomId.value !== '' && props.classSectionId !== null
)

/** ConvexError carries the domain's own wording; anything else is a fault. */
function messageFrom(error: unknown): string {
  const data = (error as { data?: unknown })?.data
  if (data && typeof data === 'object' && 'message' in data) return String(data.message)
  return 'That could not be saved. Please try again.'
}

async function submit() {
  if (!canPlace.value || !props.target || !props.classSectionId) return
  problem.value = null

  try {
    await place({
      assignmentId: assignmentId.value as Id<'teachingAssignments'>,
      classSectionId: props.classSectionId as Id<'classSections'>,
      classroomId: classroomId.value as Id<'classrooms'>,
      dayOfWeek: props.target.day as 'Monday',
      periodId: props.target.periodId as Id<'periods'>,
    })
    open.value = false
  } catch (error) {
    problem.value = messageFrom(error)
  }
}

async function removeLesson() {
  if (!props.occupied) return
  problem.value = null
  try {
    await remove({ slotId: props.occupied.id as Id<'timetableSlots'> })
    open.value = false
  } catch (error) {
    problem.value = messageFrom(error)
  }
}

const title = computed(() =>
  props.target ? `${props.target.day}, ${props.target.periodName}` : 'Lesson'
)
</script>

<template>
  <AppModal v-model:open="open" :title="title">
    <!-- An occupied cell is shown, not silently overwritten. -->
    <div v-if="occupied" class="flex flex-col gap-4">
      <div class="rounded-sm bg-page p-4">
        <p class="text-body font-medium text-ink">{{ occupied.subject }}</p>
        <p class="text-caption text-ink-secondary">{{ occupied.teacher }}</p>
        <p class="text-caption text-ink-secondary">{{ occupied.classroom }}</p>
      </div>
      <p class="text-caption text-ink-secondary">
        Remove this lesson to free the slot, then place another.
      </p>
      <p v-if="problem" class="rounded-sm bg-negative-bg px-3 py-2 text-caption text-negative-text">
        {{ problem }}
      </p>
    </div>

    <form v-else class="flex flex-col gap-4" @submit.prevent="submit">
      <AppSelect
        v-model="assignmentId"
        label="Subject and teacher"
        placeholder="Choose a teaching assignment"
        :options="assignmentOptions"
      />
      <AppSelect
        v-model="classroomId"
        label="Room"
        placeholder="Choose a room"
        :options="classroomOptions"
      />
      <p v-if="problem" class="rounded-sm bg-negative-bg px-3 py-2 text-caption text-negative-text">
        {{ problem }}
      </p>
    </form>

    <template #footer>
      <AppButton variant="secondary" @click="open = false">Cancel</AppButton>
      <AppButton v-if="occupied" :disabled="removing" @click="removeLesson">
        {{ removing ? 'Removing…' : 'Remove lesson' }}
      </AppButton>
      <AppButton v-else :disabled="!canPlace" @click="submit">
        {{ placing ? 'Placing…' : 'Place lesson' }}
      </AppButton>
    </template>
  </AppModal>
</template>
