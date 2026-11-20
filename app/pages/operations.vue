<script setup lang="ts">
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'
import type { TabDefinition } from '~/components/AppTabs.vue'

type Status = 'present' | 'absent' | 'late' | 'excused'

const tabs = [
  { key: 'register', label: 'Class register' },
  { key: 'assessments', label: 'Assessments & marks' },
  { key: 'behaviour', label: 'Behaviour' },
] as const satisfies readonly TabDefinition[]

type TabKey = (typeof tabs)[number]['key']

const statuses: { value: Status; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'late', label: 'Late' },
  { value: 'excused', label: 'Excused' },
]

const route = useRoute()
const router = useRouter()

const activeTab = computed<TabKey>({
  get() {
    const raw = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab
    return tabs.some((tab) => tab.key === raw) ? (raw as TabKey) : 'register'
  },
  set(key) {
    router.replace({ query: { ...route.query, tab: key } })
  },
})

const selectedSection = ref<string>(
  typeof route.query.section === 'string' ? route.query.section : ''
)
const date = ref(new Date().toISOString().slice(0, 10))
const teacherId = ref('')

const { data: sections } = useConvexQuery(api.timetable.sections)
const { data: teachers } = useConvexQuery(api.people.teacherOptions)
const { data: register, isPending } = useConvexQuery(
  api.operations.register,
  computed(() => ({
    classSectionId: selectedSection.value === ''
      ? undefined
      : (selectedSection.value as Id<'classSections'>),
    attendanceDate: date.value,
  }))
)
const { mutate: takeRegister, isPending: saving } = useConvexMutation(api.operations.takeRegister)

const sectionOptions = computed(() =>
  (sections.value ?? []).map((section) => ({ value: section.id, label: section.name }))
)
const teacherOptions = computed(() =>
  (teachers.value ?? []).map((teacher) => ({ value: teacher.id, label: teacher.name }))
)

watch(register, (value, previous) => {
  if (!value) return
  if (selectedSection.value === '') selectedSection.value = value.section.id
  if (!previous || previous.section.id !== value.section.id || teacherId.value === '') {
    teacherId.value = value.formTeacher?.id ?? ''
  }
})

watch(selectedSection, (value) => {
  if (!value || route.query.section === value) return
  router.replace({ query: { ...route.query, section: value } })
})

watch(
  () => route.query.section,
  (section) => {
    if (typeof section === 'string' && section !== selectedSection.value) {
      selectedSection.value = section
    }
  }
)

/** Working copy: what the register will say when saved. */
const marks = ref<Record<string, Status>>({})

// Start from what is already recorded. Students with no entry are left unset
// rather than defaulted to present - marking someone present by inaction is
// exactly the mistake a register is supposed to prevent.
watch(
  register,
  (value) => {
    if (!value) return
    const next: Record<string, Status> = {}
    for (const student of value.students) {
      if (student.status) next[student.studentId] = student.status
    }
    marks.value = next
  },
  { immediate: true }
)

const markedCount = computed(() => Object.keys(marks.value).length)
const total = computed(() => register.value?.students.length ?? 0)
const allMarked = computed(() => total.value > 0 && markedCount.value === total.value)

const problem = ref<string | null>(null)
const saved = ref<string | null>(null)

function markAll(status: Status) {
  const next: Record<string, Status> = {}
  for (const student of register.value?.students ?? []) next[student.studentId] = status
  marks.value = next
}

function messageFrom(error: unknown): string {
  const data = (error as { data?: unknown })?.data
  if (data && typeof data === 'object' && 'message' in data) return String(data.message)
  return 'The register could not be saved. Please try again.'
}

async function save() {
  if (!register.value || teacherId.value === '') return
  problem.value = null
  saved.value = null

  try {
    const result = await takeRegister({
      classSectionId: register.value.section.id,
      teacherId: teacherId.value as Id<'teachers'>,
      attendanceDate: register.value.attendanceDate,
      entries: Object.entries(marks.value).map(([studentId, status]) => ({
        studentId: studentId as Id<'students'>,
        status,
      })),
    })
    saved.value = `${result.recorded} recorded, ${result.corrected} corrected.`
  } catch (error) {
    problem.value = messageFrom(error)
  }
}

useHead({ title: 'Operations' })
</script>

<template>
  <div>
    <PageHeader title="Operations" :caption="activeTab === 'register' && register
      ? `${register.section.name} · ${register.term.name}${register.formTeacher ? ` · Form teacher: ${register.formTeacher.name}` : ''}`
      : 'Attendance, assessments and behaviour'
      " />

    <AppTabs v-model="activeTab" :tabs="tabs" label="Operations sections" id-prefix="operations" class="mb-6" />

    <div v-if="activeTab === 'register'" role="tabpanel" aria-labelledby="operations-tab-register">
      <div class="mb-6 flex flex-wrap items-end gap-4">
        <div class="w-56">
          <AppSelect v-model="selectedSection" label="Class section" placeholder="Choose a class"
            :options="sectionOptions" />
        </div>
        <div class="w-48">
          <AppInput v-model="date" label="Date" />
        </div>
        <div class="w-64">
          <AppSelect v-model="teacherId" label="Recorded by" placeholder="Choose a teacher" :options="teacherOptions" />
        </div>
      </div>

      <div v-if="isPending" class="h-64 animate-pulse rounded-lg bg-surface shadow-card" aria-busy="true" />

      <EmptyState v-else-if="!register" icon="calendar"
        message="No academic year is active yet. Create one and mark it active to take a register." />

      <EmptyState v-else-if="register.students.length === 0" icon="users"
        message="Nobody is enrolled in this class, so there is no register to take." />

      <div v-else class="rounded-lg bg-surface shadow-card">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-6 py-4">
          <div>
            <p class="text-body font-medium text-ink">
              {{ markedCount }} of {{ total }} marked
            </p>
            <p class="text-caption text-ink-secondary">
              {{ register.alreadyTaken ? 'A register already exists for this day; saving corrects it.' : `No register
              has been taken for this day yet.` }}
            </p>
          </div>

          <div class="flex items-center gap-2">
            <AppButton variant="ghost" @click="markAll('present')">Mark all present</AppButton>
            <AppButton :disabled="saving || markedCount === 0 || teacherId === ''" @click="save">
              {{ saving ? 'Saving…' : 'Save register' }}
            </AppButton>
          </div>
        </div>

        <p v-if="problem" class="border-b border-hairline bg-negative-bg px-6 py-3 text-body text-negative-text">
          {{ problem }}
        </p>
        <p v-if="saved" class="border-b border-hairline bg-positive-bg px-6 py-3 text-body text-positive-text">
          Register saved. {{ saved }}
        </p>
        <p v-if="!allMarked && markedCount > 0"
          class="border-b border-hairline bg-caution-bg px-6 py-3 text-caption text-caution-text">
          {{ total - markedCount }} student{{ total - markedCount === 1 ? '' : 's' }} not yet marked.
          Only the marked ones will be saved.
        </p>

        <ul>
          <li v-for="student in register.students" :key="student.studentId"
            class="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-6 py-3 last:border-b-0">
            <span class="flex items-center gap-3">
              <AppAvatar :name="student.fullName" :size="28" />
              <span class="text-body font-medium text-ink">{{ student.fullName }}</span>
            </span>

            <span class="flex items-center gap-1" role="group" :aria-label="`Attendance for ${student.fullName}`">
              <button v-for="option in statuses" :key="option.value" type="button"
                class="rounded-full px-3 py-1 text-caption font-medium transition-colors" :class="marks[student.studentId] === option.value
                  ? 'bg-brass text-white'
                  : 'text-ink-secondary hover:bg-page'
                  " :aria-pressed="marks[student.studentId] === option.value"
                @click="marks[student.studentId] = option.value">{{ option.label }}</button>
            </span>
          </li>
        </ul>
      </div>
    </div>

    <div v-else-if="activeTab === 'assessments'" role="tabpanel" aria-labelledby="operations-tab-assessments">
      <OperationsAssessmentsPanel />
    </div>

    <div v-else role="tabpanel" aria-labelledby="operations-tab-behaviour">
      <OperationsBehaviorPanel />
    </div>
  </div>
</template>
