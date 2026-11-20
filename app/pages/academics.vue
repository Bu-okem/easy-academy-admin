<script setup lang="ts">
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'
import type { TabDefinition } from '~/components/AppTabs.vue'

const tabs = [
  { key: 'calendar', label: 'Years & terms' },
  { key: 'classes', label: 'Grades & sections' },
  { key: 'subjects', label: 'Subjects' },
  { key: 'day', label: 'Rooms & periods' },
  { key: 'grading', label: 'Grading scale' },
] as const satisfies readonly TabDefinition[]

type TabKey = (typeof tabs)[number]['key']

const route = useRoute()
const router = useRouter()

const activeTab = computed<TabKey>({
  get() {
    const raw = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab
    return tabs.some((tab) => tab.key === raw) ? (raw as TabKey) : 'calendar'
  },
  set(key) {
    router.replace({ query: { ...route.query, tab: key } })
  },
})

const { data, isPending } = useConvexQuery(api.academics.overview)
const { data: teachers } = useConvexQuery(api.people.teacherOptions)
const { mutate: createYear } = useConvexMutation(api.academics.createYear)
const { mutate: activateYear } = useConvexMutation(api.academics.activateYear)
const { mutate: createTerm } = useConvexMutation(api.academics.createTerm)
const { mutate: createSubject } = useConvexMutation(api.academics.createSubject)
const { mutate: createGradeLevel } = useConvexMutation(api.academics.createGradeLevel)
const { mutate: createClassSection } = useConvexMutation(api.academics.createClassSection)
const { mutate: createClassroom } = useConvexMutation(api.academics.createClassroom)
const { mutate: createPeriod } = useConvexMutation(api.academics.createPeriod)
const { mutate: updatePeriod } = useConvexMutation(api.academics.updatePeriod)
const { mutate: deletePeriod } = useConvexMutation(api.academics.deletePeriod)
const { mutate: createGradingBand } = useConvexMutation(api.academics.createGradingBand)
const { mutate: deleteGradingBand } = useConvexMutation(api.academics.deleteGradingBand)
const { mutate: setFormTeacher } = useConvexMutation(api.academics.setFormTeacher)

const problem = ref<string | null>(null)

function messageFrom(error: unknown): string {
  const data = (error as { data?: unknown })?.data
  if (data && typeof data === 'object' && 'message' in data) return String(data.message)
  return 'That could not be saved. Please try again.'
}

async function attempt(action: () => Promise<unknown>, onDone?: () => void) {
  problem.value = null
  try {
    await action()
    onDone?.()
  } catch (error) {
    problem.value = messageFrom(error)
  }
}

// --- Year dialog ------------------------------------------------------------
const yearDialog = ref(false)
const yearName = ref('')
watch(yearDialog, (open) => {
  if (open) {
    yearName.value = ''
    problem.value = null
  }
})
const saveYear = () =>
  attempt(() => createYear({ name: yearName.value }), () => (yearDialog.value = false))

// --- Term dialog ------------------------------------------------------------
const termDialog = ref(false)
const termYearId = ref<string | null>(null)
const termName = ref('')
const termStart = ref('')
const termEnd = ref('')

function openTermDialog(yearId: string) {
  termYearId.value = yearId
  termName.value = ''
  termStart.value = ''
  termEnd.value = ''
  problem.value = null
  termDialog.value = true
}

const saveTerm = () =>
  attempt(
    () =>
      createTerm({
        academicYearId: termYearId.value as Id<'academicYears'>,
        name: termName.value,
        startDate: termStart.value,
        endDate: termEnd.value,
      }),
    () => (termDialog.value = false)
  )

// --- Subject dialog ---------------------------------------------------------
const subjectDialog = ref(false)
const subjectName = ref('')
const subjectCode = ref('')
watch(subjectDialog, (open) => {
  if (open) {
    subjectName.value = ''
    subjectCode.value = ''
    problem.value = null
  }
})
const saveSubject = () =>
  attempt(
    () => createSubject({ name: subjectName.value, code: subjectCode.value }),
    () => (subjectDialog.value = false)
  )

// --- Grade level & section dialogs ------------------------------------------
const gradeDialog = ref(false)
const gradeName = ref('')
watch(gradeDialog, (open) => {
  if (open) {
    gradeName.value = ''
    problem.value = null
  }
})
const saveGrade = () =>
  attempt(() => createGradeLevel({ name: gradeName.value }), () => (gradeDialog.value = false))

const sectionDialog = ref(false)
const sectionGradeId = ref('')
const sectionName = ref('')
const gradeOptions = computed(() =>
  (data.value?.gradeLevels ?? []).map((grade) => ({ value: grade.id, label: grade.name }))
)
function openSectionDialog(gradeId = '') {
  sectionGradeId.value = gradeId || (data.value?.gradeLevels[0]?.id ?? '')
  sectionName.value = ''
  problem.value = null
  sectionDialog.value = true
}
const saveSection = () =>
  attempt(
    () =>
      createClassSection({
        gradeLevelId: sectionGradeId.value as Id<'gradeLevels'>,
        sectionName: sectionName.value,
      }),
    () => (sectionDialog.value = false)
  )

// --- Classroom & period dialogs ---------------------------------------------
const roomDialog = ref(false)
const roomName = ref('')
const roomBuilding = ref('')
const roomCapacity = ref('')
watch(roomDialog, (open) => {
  if (open) {
    roomName.value = ''
    roomBuilding.value = ''
    roomCapacity.value = ''
    problem.value = null
  }
})
function saveRoom() {
  const cap = roomCapacity.value.trim() === '' ? undefined : Number(roomCapacity.value)
  if (cap !== undefined && !Number.isFinite(cap)) {
    problem.value = 'Capacity must be a whole number greater than zero.'
    return
  }
  return attempt(
    () =>
      createClassroom({
        name: roomName.value,
        buildingName: roomBuilding.value.trim() === '' ? undefined : roomBuilding.value,
        capacity: cap,
      }),
    () => (roomDialog.value = false)
  )
}

const teacherOptions = computed(() => [
  { value: '', label: 'No form teacher assigned' },
  ...(teachers.value ?? []).map((t) => ({ value: t.id, label: t.name })),
])

const formTeacherDialog = ref(false)
const formTeacherSectionId = ref<Id<'classSections'> | null>(null)
const formTeacherSectionName = ref('')
const formTeacherId = ref('')

function openFormTeacherDialog(section: {
  id: Id<'classSections'>
  name: string
  formTeacher: { id: Id<'teachers'>; name: string } | null
}) {
  formTeacherSectionId.value = section.id
  formTeacherSectionName.value = section.name
  formTeacherId.value = section.formTeacher?.id ?? ''
  problem.value = null
  formTeacherDialog.value = true
}

const saveFormTeacher = () => {
  if (!formTeacherSectionId.value) return
  return attempt(
    () =>
      setFormTeacher({
        classSectionId: formTeacherSectionId.value!,
        teacherId: formTeacherId.value ? (formTeacherId.value as Id<'teachers'>) : null,
      }),
    () => (formTeacherDialog.value = false)
  )
}

const bellScheduleDialog = ref(false)
const periodDialog = ref(false)
const editingPeriodId = ref<Id<'periods'> | null>(null)
const periodName = ref('')
const periodStart = ref('')
const periodEnd = ref('')
const periodIsBreak = ref(false)

const removePeriodTarget = ref<{ id: Id<'periods'>; name: string } | null>(null)
const removePeriodMessage = ref<string | null>(null)

function openNewPeriod() {
  editingPeriodId.value = null
  periodName.value = ''
  periodStart.value = ''
  periodEnd.value = ''
  periodIsBreak.value = false
  problem.value = null
  periodDialog.value = true
}

function openEditPeriod(period: {
  id: Id<'periods'>
  name: string
  startTime: string
  endTime: string
  isBreak: boolean
}) {
  editingPeriodId.value = period.id
  periodName.value = period.name
  periodStart.value = period.startTime
  periodEnd.value = period.endTime
  periodIsBreak.value = period.isBreak
  problem.value = null
  periodDialog.value = true
}

const savePeriod = () =>
  attempt(
    () =>
      editingPeriodId.value
        ? updatePeriod({
            periodId: editingPeriodId.value,
            name: periodName.value,
            startTime: periodStart.value,
            endTime: periodEnd.value,
            isBreak: periodIsBreak.value,
          })
        : createPeriod({
            name: periodName.value,
            startTime: periodStart.value,
            endTime: periodEnd.value,
            isBreak: periodIsBreak.value,
          }),
    () => (periodDialog.value = false)
  )

async function removePeriod(period: { id: Id<'periods'>; name: string }, clearPlacedSlots = false) {
  removePeriodMessage.value = null
  try {
    await deletePeriod({ periodId: period.id, clearPlacedSlots })
    removePeriodTarget.value = null
  } catch (error) {
    const data = (error as { data?: { code?: string; message?: string } })?.data
    if (data?.code === 'periodInUse') {
      removePeriodTarget.value = period
      removePeriodMessage.value = data.message ?? 'Placed lessons use this period.'
      return
    }
    problem.value = messageFrom(error)
  }
}

// --- Grading band dialog ----------------------------------------------------
const bandDialog = ref(false)
const bandScaleName = ref('Standard')
const bandLetter = ref('')
const bandMin = ref('')
const bandMax = ref('')
const bandGpa = ref('')
watch(bandDialog, (open) => {
  if (open) {
    bandScaleName.value = 'Standard'
    bandLetter.value = ''
    bandMin.value = ''
    bandMax.value = ''
    bandGpa.value = ''
    problem.value = null
  }
})
function saveBand() {
  const minScore = Number(bandMin.value)
  const maxScore = Number(bandMax.value)
  const gpaPoint = Number(bandGpa.value)
  if (!Number.isFinite(minScore) || !Number.isFinite(maxScore) || !Number.isFinite(gpaPoint)) {
    problem.value = 'Minimum score, maximum score and GPA points must be numbers.'
    return
  }
  return attempt(
    () =>
      createGradingBand({
        name: bandScaleName.value,
        letterGrade: bandLetter.value,
        minScore,
        maxScore,
        gpaPoint,
      }),
    () => (bandDialog.value = false)
  )
}

function formatUncoveredRanges(scores: readonly number[]): string {
  if (scores.length === 0) return ''
  const ranges: string[] = []
  let start = scores[0]!
  let prev = scores[0]!
  for (let i = 1; i < scores.length; i++) {
    const current = scores[i]!
    if (current === prev + 1) {
      prev = current
    } else {
      ranges.push(start === prev ? `${start}` : `${start}–${prev}`)
      start = current
      prev = current
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}–${prev}`)
  return ranges.join(', ')
}

const anyModalOpen = computed(
  () =>
    yearDialog.value ||
    termDialog.value ||
    subjectDialog.value ||
    gradeDialog.value ||
    sectionDialog.value ||
    roomDialog.value ||
    periodDialog.value ||
    bandDialog.value
)

useHead({ title: 'Academics' })
</script>

<template>
  <div>
    <PageHeader
      title="Academics"
      caption="Years, terms, grade levels, sections, rooms, periods, subjects and grading"
    />

    <AppTabs
      v-model="activeTab"
      :tabs="tabs"
      label="Academic settings"
      id-prefix="academics"
      class="mb-6"
    />

    <p
      v-if="problem && !anyModalOpen"
      class="mb-4 rounded-sm bg-negative-bg px-4 py-3 text-body text-negative-text"
    >{{ problem }}</p>

    <div v-if="isPending" class="h-64 animate-pulse rounded-lg bg-surface shadow-card" aria-busy="true" />

    <!-- Years & terms -->
    <div v-else-if="activeTab === 'calendar'" role="tabpanel" aria-labelledby="academics-tab-calendar">
      <div class="mb-4 flex justify-end">
        <AppButton @click="yearDialog = true">Add academic year</AppButton>
      </div>

      <EmptyState
        v-if="!data || data.years.length === 0"
        icon="calendar"
        message="No academic years yet. Add one to unlock enrolment, timetabling and results."
      />

      <div v-else class="flex flex-col gap-4">
        <section
          v-for="year in data.years"
          :key="year.id"
          class="rounded-lg bg-surface p-6 shadow-card"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <h2 class="font-display text-section font-medium text-ink">{{ year.name }}</h2>
              <StatusBadge v-if="year.isActive" status="published" />
            </div>

            <div class="flex items-center gap-2">
              <AppButton
                v-if="!year.isActive"
                variant="ghost"
                @click="attempt(() => activateYear({ yearId: year.id }))"
              >Make active</AppButton>
              <AppButton variant="secondary" @click="openTermDialog(year.id)">Add term</AppButton>
            </div>
          </div>

          <ul v-if="year.terms.length > 0" class="mt-4">
            <AppListItem
              v-for="term in year.terms"
              :key="term.id"
              :title="term.name"
              :detail="`${term.startDate} to ${term.endDate}`"
              icon="calendar"
              severity="accent"
            />
          </ul>
          <p v-else class="mt-4 text-body text-ink-secondary">
            No terms yet. Add one to start the school year.
          </p>
        </section>
      </div>
    </div>

    <!-- Grades & sections -->
    <div v-else-if="activeTab === 'classes'" role="tabpanel" aria-labelledby="academics-tab-classes">
      <div class="mb-4 flex flex-wrap justify-end gap-2">
        <AppButton
          variant="secondary"
          :disabled="!data || data.gradeLevels.length === 0"
          @click="openSectionDialog()"
        >Add section</AppButton>
        <AppButton @click="gradeDialog = true">Add grade level</AppButton>
      </div>

      <EmptyState
        v-if="!data || data.gradeLevels.length === 0"
        icon="users"
        message="No grade levels yet. Add a grade level to create class sections."
      />

      <div v-else class="flex flex-col gap-4">
        <section
          v-for="grade in data.gradeLevels"
          :key="grade.id"
          class="rounded-lg bg-surface p-6 shadow-card"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="font-display text-section font-medium text-ink">{{ grade.name }}</h2>
            <AppButton variant="secondary" @click="openSectionDialog(grade.id)">Add section</AppButton>
          </div>

          <div v-if="grade.sections.length > 0" class="mt-4 flex flex-wrap gap-2">
            <button
              v-for="section in grade.sections"
              :key="section.id"
              type="button"
              class="flex items-center gap-2 rounded-full bg-page px-3.5 py-1.5 text-body transition hover:bg-brass-tint/60"
              @click="openFormTeacherDialog(section)"
            >
              <span class="font-medium text-ink">{{ section.name }}</span>
              <span class="text-caption text-ink-secondary">
                · {{ section.formTeacher ? section.formTeacher.name : 'Assign form teacher' }}
              </span>
            </button>
          </div>
          <p v-else class="mt-4 text-body text-ink-secondary">
            No class sections in this grade yet.
          </p>
        </section>
      </div>
    </div>

    <!-- Subjects -->
    <div v-else-if="activeTab === 'subjects'" role="tabpanel" aria-labelledby="academics-tab-subjects">
      <div class="mb-4 flex justify-end">
        <AppButton @click="subjectDialog = true">Add subject</AppButton>
      </div>

      <EmptyState
        v-if="!data || data.subjects.length === 0"
        icon="board"
        message="No subjects yet. Add one to start assigning teachers to classes."
      />

      <ul v-else class="rounded-lg bg-surface px-6 shadow-card">
        <AppListItem
          v-for="subject in data.subjects"
          :key="subject.id"
          :title="subject.name"
          :detail="subject.code"
          icon="board"
          severity="accent"
        />
      </ul>
    </div>

    <!-- Rooms & periods -->
    <div v-else-if="activeTab === 'day'" role="tabpanel" aria-labelledby="academics-tab-day">
      <div class="grid grid-cols-12 gap-6">
        <section class="col-span-12 rounded-lg bg-surface p-6 shadow-card lg:col-span-6">
          <div class="mb-4 flex items-center justify-between gap-3">
            <h2 class="font-display text-section font-medium text-ink">Classrooms</h2>
            <AppButton variant="secondary" @click="roomDialog = true">Add room</AppButton>
          </div>

          <p v-if="!data || data.classrooms.length === 0" class="text-body text-ink-secondary">
            No classrooms yet. Add a room to place lessons on the timetable.
          </p>

          <ul v-else>
            <AppListItem
              v-for="room in data.classrooms"
              :key="room.id"
              :title="room.name"
              :detail="
                [room.buildingName, room.capacity ? `${room.capacity} seats` : null]
                  .filter(Boolean)
                  .join(' · ') || 'No building or capacity noted'
              "
              icon="board"
              severity="accent"
            />
          </ul>
        </section>

        <section class="col-span-12 rounded-lg bg-surface p-6 shadow-card lg:col-span-6">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 class="font-display text-section font-medium text-ink">School day periods</h2>
            <div class="flex flex-wrap gap-2">
              <AppButton variant="secondary" @click="bellScheduleDialog = true">
                Generate bell schedule
              </AppButton>
              <AppButton variant="secondary" @click="openNewPeriod">Add period</AppButton>
            </div>
          </div>

          <p v-if="!data || data.periods.length === 0" class="text-body text-ink-secondary">
            No periods defined yet. Generate a bell schedule or add periods one by one.
          </p>

          <ul v-else>
            <AppListItem
              v-for="period in data.periods"
              :key="period.id"
              :title="period.name"
              :detail="`${period.startTime}–${period.endTime}${period.isBreak ? ' · Break' : ''}`"
              icon="calendar"
              :severity="period.isBreak ? 'neutral' : 'accent'"
            >
              <template #trailing>
                <div class="flex items-center gap-1">
                  <button
                    type="button"
                    class="rounded-md px-2 py-1 text-caption font-medium text-brass hover:bg-page"
                    @click="openEditPeriod(period)"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="rounded-md px-2 py-1 text-caption font-medium text-ink-secondary hover:bg-page hover:text-ink"
                    @click="removePeriod({ id: period.id, name: period.name })"
                  >
                    Remove
                  </button>
                </div>
              </template>
            </AppListItem>
          </ul>
        </section>
      </div>
    </div>

    <!-- Grading scale -->
    <div v-else role="tabpanel" aria-labelledby="academics-tab-grading">
      <div class="mb-4 flex justify-end">
        <AppButton @click="bandDialog = true">Add grading band</AppButton>
      </div>

      <p
        v-if="data && data.uncoveredScores.length > 0"
        class="mb-4 rounded-sm bg-caution-bg px-4 py-3 text-body text-caution-text"
      >
        Uncovered scores (0–100): {{ formatUncoveredRanges(data.uncoveredScores) }}. Students scoring in these ranges will not receive a grade.
      </p>

      <EmptyState
        v-if="!data || data.gradingScales.length === 0"
        icon="award"
        message="No grading bands defined yet. Add bands from 0 to 100 so results can assign grades and GPA points."
      />

      <ul v-else class="rounded-lg bg-surface px-6 shadow-card">
        <AppListItem
          v-for="band in data.gradingScales"
          :key="band.id"
          :title="`Grade ${band.letterGrade} (${band.minScore}–${band.maxScore}%)`"
          :detail="`${band.name} · ${band.gpaPoint} GPA points`"
          icon="award"
          severity="accent"
        >
          <template #trailing>
            <button
              type="button"
              class="rounded-md px-2.5 py-1 text-caption font-medium text-ink-secondary transition hover:bg-page hover:text-ink"
              @click="attempt(() => deleteGradingBand({ gradingScaleId: band.id }))"
            >
              Remove
            </button>
          </template>
        </AppListItem>
      </ul>
    </div>

    <!-- Modals -->
    <AppModal v-model:open="yearDialog" title="Add academic year">
      <form class="flex flex-col gap-4" @submit.prevent="saveYear">
        <AppInput v-model="yearName" label="Name" placeholder="2027/2028" hint="The first year you add becomes the active one." />
        <p v-if="problem" class="rounded-sm bg-negative-bg px-3 py-2 text-caption text-negative-text">
          {{ problem }}
        </p>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="yearDialog = false">Cancel</AppButton>
        <AppButton :disabled="yearName.trim() === ''" @click="saveYear">Add year</AppButton>
      </template>
    </AppModal>

    <AppModal v-model:open="termDialog" title="Add term">
      <form class="flex flex-col gap-4" @submit.prevent="saveTerm">
        <AppInput v-model="termName" label="Name" placeholder="Term 1" />
        <AppInput v-model="termStart" label="Starts" placeholder="YYYY-MM-DD" />
        <AppInput v-model="termEnd" label="Ends" placeholder="YYYY-MM-DD" hint="Terms in a year cannot overlap." />
        <p v-if="problem" class="rounded-sm bg-negative-bg px-3 py-2 text-caption text-negative-text">
          {{ problem }}
        </p>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="termDialog = false">Cancel</AppButton>
        <AppButton
          :disabled="termName.trim() === '' || termStart === '' || termEnd === ''"
          @click="saveTerm"
        >Add term</AppButton>
      </template>
    </AppModal>

    <AppModal v-model:open="subjectDialog" title="Add subject">
      <form class="flex flex-col gap-4" @submit.prevent="saveSubject">
        <AppInput v-model="subjectName" label="Name" placeholder="Mathematics" />
        <AppInput v-model="subjectCode" label="Code" placeholder="MATH101" hint="Codes are stored upper-cased without spaces, and must be unique." />
        <p v-if="problem" class="rounded-sm bg-negative-bg px-3 py-2 text-caption text-negative-text">
          {{ problem }}
        </p>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="subjectDialog = false">Cancel</AppButton>
        <AppButton
          :disabled="subjectName.trim() === '' || subjectCode.trim() === ''"
          @click="saveSubject"
        >Add subject</AppButton>
      </template>
    </AppModal>

    <AppModal v-model:open="gradeDialog" title="Add grade level">
      <form class="flex flex-col gap-4" @submit.prevent="saveGrade">
        <AppInput v-model="gradeName" label="Name" placeholder="Grade 12" />
        <p v-if="problem" class="rounded-sm bg-negative-bg px-3 py-2 text-caption text-negative-text">
          {{ problem }}
        </p>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="gradeDialog = false">Cancel</AppButton>
        <AppButton :disabled="gradeName.trim() === ''" @click="saveGrade">Add grade</AppButton>
      </template>
    </AppModal>

    <AppModal v-model:open="sectionDialog" title="Add class section">
      <form class="flex flex-col gap-4" @submit.prevent="saveSection">
        <AppSelect
          v-model="sectionGradeId"
          label="Grade level"
          placeholder="Choose a grade"
          :options="gradeOptions"
        />
        <AppInput v-model="sectionName" label="Section name" placeholder="10C" />
        <p v-if="problem" class="rounded-sm bg-negative-bg px-3 py-2 text-caption text-negative-text">
          {{ problem }}
        </p>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="sectionDialog = false">Cancel</AppButton>
        <AppButton
          :disabled="sectionGradeId === '' || sectionName.trim() === ''"
          @click="saveSection"
        >Add section</AppButton>
      </template>
    </AppModal>

    <AppModal v-model:open="roomDialog" title="Add classroom">
      <form class="flex flex-col gap-4" @submit.prevent="saveRoom">
        <AppInput v-model="roomName" label="Room name" placeholder="Room 3" />
        <AppInput v-model="roomBuilding" label="Building" placeholder="Main Block (optional)" />
        <AppInput v-model="roomCapacity" label="Capacity" placeholder="32 (optional)" />
        <p v-if="problem" class="rounded-sm bg-negative-bg px-3 py-2 text-caption text-negative-text">
          {{ problem }}
        </p>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="roomDialog = false">Cancel</AppButton>
        <AppButton :disabled="roomName.trim() === ''" @click="saveRoom">Add room</AppButton>
      </template>
    </AppModal>

    <AppModal
      v-model:open="periodDialog"
      :title="editingPeriodId ? 'Edit school day period' : 'Add school day period'"
    >
      <form class="flex flex-col gap-4" @submit.prevent="savePeriod">
        <AppInput v-model="periodName" label="Name" placeholder="Period 5" />
        <div class="grid grid-cols-2 gap-3">
          <AppInput v-model="periodStart" label="Starts" placeholder="11:35" />
          <AppInput v-model="periodEnd" label="Ends" placeholder="12:20" />
        </div>
        <label class="flex items-center gap-2.5 text-body text-ink">
          <input
            v-model="periodIsBreak"
            type="checkbox"
            class="h-4 w-4 rounded border-hairline accent-brass"
          >
          <span>This period is a break (not a teaching slot)</span>
        </label>
        <p v-if="problem" class="rounded-sm bg-negative-bg px-3 py-2 text-caption text-negative-text">
          {{ problem }}
        </p>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="periodDialog = false">Cancel</AppButton>
        <AppButton
          :disabled="periodName.trim() === '' || periodStart.trim() === '' || periodEnd.trim() === ''"
          @click="savePeriod"
        >
          {{ editingPeriodId ? 'Save period' : 'Add period' }}
        </AppButton>
      </template>
    </AppModal>

    <AppModal
      :open="removePeriodTarget !== null"
      title="Period has placed lessons"
      @update:open="(val) => { if (!val) removePeriodTarget = null }"
    >
      <p class="text-body text-ink-secondary">
        {{ removePeriodMessage }}
      </p>
      <template #footer>
        <AppButton variant="secondary" @click="removePeriodTarget = null">Cancel</AppButton>
        <AppButton
          v-if="removePeriodTarget"
          @click="removePeriod(removePeriodTarget, true)"
        >
          Clear lessons &amp; remove
        </AppButton>
      </template>
    </AppModal>

    <AcademicsBellScheduleDialog v-model:open="bellScheduleDialog" />

    <AppModal
      v-model:open="formTeacherDialog"
      :title="`Form teacher · ${formTeacherSectionName}`"
    >
      <form class="flex flex-col gap-4" @submit.prevent="saveFormTeacher">
        <AppSelect
          v-model="formTeacherId"
          label="Form teacher"
          placeholder="Choose a teacher"
          :options="teacherOptions"
        />
        <p class="text-caption text-ink-secondary">
          The form teacher is selected by default in the Recorded by dropdown when taking
          attendance for this class. Part-time or specialist teachers do not need a class.
        </p>
        <p v-if="problem" class="rounded-sm bg-negative-bg px-3 py-2 text-caption text-negative-text">
          {{ problem }}
        </p>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="formTeacherDialog = false">Cancel</AppButton>
        <AppButton @click="saveFormTeacher">Save</AppButton>
      </template>
    </AppModal>

    <AppModal v-model:open="bandDialog" title="Add grading band">
      <form class="flex flex-col gap-4" @submit.prevent="saveBand">
        <AppInput v-model="bandScaleName" label="Scale name" placeholder="Standard" />
        <div class="grid grid-cols-2 gap-3">
          <AppInput v-model="bandLetter" label="Letter grade" placeholder="A" />
          <AppInput v-model="bandGpa" label="GPA points" placeholder="4" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <AppInput v-model="bandMin" label="Min score (%)" placeholder="70" />
          <AppInput v-model="bandMax" label="Max score (%)" placeholder="100" />
        </div>
        <p v-if="problem" class="rounded-sm bg-negative-bg px-3 py-2 text-caption text-negative-text">
          {{ problem }}
        </p>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="bandDialog = false">Cancel</AppButton>
        <AppButton
          :disabled="
            bandScaleName.trim() === '' ||
            bandLetter.trim() === '' ||
            bandMin.trim() === '' ||
            bandMax.trim() === '' ||
            bandGpa.trim() === ''
          "
          @click="saveBand"
        >Add band</AppButton>
      </template>
    </AppModal>
  </div>
</template>
