<script setup lang="ts">
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'

const props = defineProps<{
  userId: Id<'users'>
}>()

const open = defineModel<boolean>('open', { required: true })

defineEmits<{
  selectUser: [userId: Id<'users'>]
}>()

const { can } = useViewer()

const { data: profile, isPending } = useConvexQuery(
  api.people.profile,
  computed(() => ({ userId: props.userId }))
)

const { data: enrollmentOptions } = useConvexQuery(
  api.people.enrollmentOptions,
  computed(() => (can('academics.manage') ? {} : 'skip'))
)

const { mutate: updateStudentSection } = useConvexMutation(api.people.updateStudentSection)
const { mutate: updateTeacher } = useConvexMutation(api.people.updateTeacher)
const { mutate: updateStaff } = useConvexMutation(api.people.updateStaff)

const editMode = ref<'student' | 'teacher' | 'staff' | null>(null)
const editSectionId = ref<string>('')
const editSpecialization = ref('')
const editJobTitle = ref('')
const editDepartment = ref('')
const editError = ref<string | null>(null)
const isSavingEdit = ref(false)

watch(
  () => [props.userId, open.value],
  () => {
    editMode.value = null
    editError.value = null
  }
)

function startEditStudent() {
  if (!profile.value || profile.value.kind !== 'student') return
  editSectionId.value = profile.value.classSectionId ?? ''
  editError.value = null
  editMode.value = 'student'
}

function startEditTeacher() {
  if (!profile.value || profile.value.kind !== 'teacher') return
  editSpecialization.value = profile.value.specialization ?? ''
  editError.value = null
  editMode.value = 'teacher'
}

function startEditStaff() {
  if (!profile.value || profile.value.kind !== 'staff') return
  editJobTitle.value = profile.value.jobTitle ?? ''
  editDepartment.value = profile.value.department ?? ''
  editError.value = null
  editMode.value = 'staff'
}

async function saveEdit() {
  if (!profile.value) return
  editError.value = null
  isSavingEdit.value = true
  try {
    if (editMode.value === 'student' && profile.value.kind === 'student' && profile.value.studentId) {
      await updateStudentSection({
        studentId: profile.value.studentId,
        classSectionId: editSectionId.value ? (editSectionId.value as Id<'classSections'>) : null,
      })
    } else if (editMode.value === 'teacher' && profile.value.kind === 'teacher' && profile.value.teacherId) {
      await updateTeacher({
        teacherId: profile.value.teacherId,
        specialization: editSpecialization.value,
      })
    } else if (editMode.value === 'staff' && profile.value.kind === 'staff' && profile.value.staffId) {
      await updateStaff({
        staffId: profile.value.staffId,
        jobTitle: editJobTitle.value,
        department: editDepartment.value,
      })
    }
    editMode.value = null
  } catch (error) {
    const data = (error as { data?: unknown })?.data
    editError.value =
      data && typeof data === 'object' && 'message' in data
        ? String(data.message)
        : 'Could not save changes.'
  } finally {
    isSavingEdit.value = false
  }
}

const title = computed(() => (profile.value ? `${profile.value.roleLabel} profile` : 'Profile'))
</script>

<template>
  <AppModal v-model:open="open" :title="title" wide>
    <div v-if="isPending" class="h-56 animate-pulse rounded-sm bg-page" aria-busy="true" />

    <p v-else-if="!profile" class="text-body text-ink-secondary">
      That person record could not be found.
    </p>

    <div v-else class="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
      <!-- Profile header (DESIGN.md 5.14: 48px avatar) -->
      <div class="flex flex-wrap items-center gap-4 rounded-sm bg-page p-4">
        <AppAvatar :name="profile.fullName" :size="48" />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2.5">
            <h3 class="font-display text-section font-medium text-ink">
              {{ profile.fullName }}
            </h3>
            <span class="rounded-full bg-brass-tint px-2.5 py-0.5 text-badge font-semibold text-brass-dark">
              {{ profile.roleLabel }}
            </span>
          </div>
          <p class="mt-0.5 truncate text-caption text-ink-secondary">{{ profile.email }}</p>
        </div>
      </div>

      <!-- Student profile -->
      <template v-if="profile.kind === 'student'">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div class="rounded-sm border border-hairline p-3">
            <div class="flex items-center justify-between gap-2">
              <p class="text-badge font-semibold uppercase tracking-wide text-ink-secondary">Class</p>
              <button
                v-if="can('academics.manage') && profile.studentId && editMode !== 'student'"
                type="button"
                class="text-caption font-medium text-brass hover:underline"
                @click="startEditStudent"
              >
                Edit
              </button>
            </div>
            <template v-if="editMode === 'student'">
              <select
                v-model="editSectionId"
                aria-label="Class section"
                class="mt-1.5 w-full rounded-sm border border-hairline bg-surface px-2.5 py-1.5 text-caption text-ink focus:border-brass focus:outline-none"
              >
                <option value="">Unassigned</option>
                <option
                  v-for="section in enrollmentOptions?.sections ?? []"
                  :key="section.id"
                  :value="section.id"
                >
                  {{ section.name }}
                </option>
              </select>
              <div class="mt-2 flex items-center gap-2">
                <AppButton size="sm" :disabled="isSavingEdit" @click="saveEdit">
                  {{ isSavingEdit ? 'Saving…' : 'Save' }}
                </AppButton>
                <AppButton size="sm" variant="secondary" @click="editMode = null">Cancel</AppButton>
              </div>
              <p v-if="editError" class="mt-1.5 text-caption text-danger-text">{{ editError }}</p>
            </template>
            <template v-else>
              <p class="mt-1 text-body font-medium text-ink">
                {{ profile.sectionName ?? 'Unassigned' }}
              </p>
              <p v-if="profile.gradeName" class="text-caption text-ink-secondary">
                {{ profile.gradeName }}
              </p>
            </template>
          </div>

          <div class="rounded-sm border border-hairline p-3">
            <p class="text-badge font-semibold uppercase tracking-wide text-ink-secondary">
              Date of birth
            </p>
            <p class="mt-1 text-body font-medium text-ink">
              {{
                profile.dateOfBirth
                  ? (formatDayMonthYear(profile.dateOfBirth) ?? profile.dateOfBirth)
                  : '—'
              }}
            </p>
          </div>

          <div class="rounded-sm border border-hairline p-3">
            <p class="text-badge font-semibold uppercase tracking-wide text-ink-secondary">
              Attendance{{ profile.termName ? ` · ${profile.termName}` : '' }}
            </p>
            <p class="mt-1 text-body font-medium text-ink">
              {{ profile.attendance.counts.present }} present ·
              {{ profile.attendance.counts.absent }} absent
            </p>
            <p class="text-caption text-ink-secondary">
              {{ profile.attendance.counts.late }} late ·
              {{ profile.attendance.counts.excused }} excused
            </p>
          </div>
        </div>

        <!-- Parents / guardians -->
        <div>
          <h4 class="mb-2 text-caption font-semibold uppercase tracking-wide text-ink-secondary">
            Parents &amp; guardians
          </h4>
          <p v-if="profile.parents.length === 0" class="text-body text-ink-secondary">
            No parent or guardian linked yet.
          </p>
          <ul v-else class="divide-y divide-hairline rounded-sm border border-hairline">
            <li
              v-for="parent in profile.parents"
              :key="parent.userId"
              class="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <div class="min-w-0">
                <p class="truncate text-body font-medium text-ink">{{ parent.fullName }}</p>
                <p class="truncate text-caption text-ink-secondary">{{ parent.email }}</p>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-md px-2 py-1 text-caption font-medium text-brass hover:bg-page"
                @click="$emit('selectUser', parent.userId)"
              >View profile</button>
            </li>
          </ul>
        </div>

        <!-- Enrolment history & electives -->
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <h4 class="mb-2 text-caption font-semibold uppercase tracking-wide text-ink-secondary">
              Enrolment history
            </h4>
            <p v-if="profile.enrollments.length === 0" class="text-body text-ink-secondary">
              No yearly enrolments recorded.
            </p>
            <ul v-else class="divide-y divide-hairline rounded-sm border border-hairline">
              <li
                v-for="item in profile.enrollments"
                :key="item.id"
                class="flex items-center justify-between gap-2 px-3 py-2"
              >
                <span class="text-body text-ink">{{ item.yearName }}</span>
                <span class="flex items-center gap-2">
                  <span class="text-caption font-medium text-ink-secondary">{{ item.sectionName }}</span>
                  <span
                    v-if="item.isActiveYear"
                    class="rounded-full bg-positive-bg px-2 py-0.5 text-badge font-semibold text-positive-text"
                  >Active</span>
                </span>
              </li>
            </ul>
          </div>

          <div>
            <h4 class="mb-2 text-caption font-semibold uppercase tracking-wide text-ink-secondary">
              Term electives{{ profile.termName ? ` · ${profile.termName}` : '' }}
            </h4>
            <p v-if="profile.electives.length === 0" class="text-body text-ink-secondary">
              No elective subjects enrolled this term.
            </p>
            <ul v-else class="divide-y divide-hairline rounded-sm border border-hairline">
              <li
                v-for="subject in profile.electives"
                :key="subject.id"
                class="flex items-center justify-between gap-2 px-3 py-2"
              >
                <span class="text-body text-ink">{{ subject.name }}</span>
                <span class="text-caption text-ink-secondary">{{ subject.code }}</span>
              </li>
            </ul>
          </div>
        </div>

        <!-- Term results -->
        <div v-if="profile.results">
          <div class="mb-2 flex items-center justify-between gap-2">
            <h4 class="text-caption font-semibold uppercase tracking-wide text-ink-secondary">
              Term results{{ profile.termName ? ` · ${profile.termName}` : '' }}
            </h4>
            <div class="flex items-center gap-2">
              <span v-if="profile.results.termGpa !== null" class="font-display text-body font-semibold text-ink">
                GPA {{ profile.results.termGpa }}
              </span>
              <StatusBadge :status="profile.results.isPublished ? 'published' : 'draft'" />
            </div>
          </div>

          <ul class="divide-y divide-hairline rounded-sm border border-hairline">
            <li
              v-for="subject in profile.results.subjects"
              :key="subject.id"
              class="flex items-center justify-between gap-3 px-4 py-2"
            >
              <span class="text-body text-ink">
                {{ subject.subjectName }}
                <span class="ml-1.5 text-caption text-ink-secondary">{{ subject.subjectCode }}</span>
              </span>
              <span class="flex items-center gap-2.5">
                <span class="text-body text-ink">{{ subject.cumulativeScore }}%</span>
                <span class="inline-flex min-w-[26px] justify-center rounded-full bg-brass-tint px-2 py-0.5 text-badge font-semibold text-brass-dark">
                  {{ subject.letterGrade }}
                </span>
              </span>
            </li>
          </ul>
        </div>

        <!-- Recent attendance -->
        <div v-if="profile.attendance.recent.length > 0">
          <h4 class="mb-2 text-caption font-semibold uppercase tracking-wide text-ink-secondary">
            Recent attendance
          </h4>
          <ul class="divide-y divide-hairline rounded-sm border border-hairline">
            <li
              v-for="entry in profile.attendance.recent"
              :key="entry.id"
              class="flex items-center justify-between gap-3 px-4 py-2"
            >
              <span class="text-body text-ink">
                {{ formatDayMonthYear(entry.attendanceDate) ?? entry.attendanceDate }}
                <span v-if="entry.remarks" class="ml-2 text-caption text-ink-secondary">
                  · {{ entry.remarks }}
                </span>
              </span>
              <StatusBadge :status="entry.status" />
            </li>
          </ul>
        </div>

        <!-- Behaviour -->
        <div>
          <h4 class="mb-2 text-caption font-semibold uppercase tracking-wide text-ink-secondary">
            Behaviour{{ profile.termName ? ` · ${profile.termName}` : '' }}
          </h4>
          <p v-if="profile.behavior.length === 0" class="text-body text-ink-secondary">
            No merits or demerits recorded this term.
          </p>
          <ul v-else class="divide-y divide-hairline rounded-sm border border-hairline">
            <li
              v-for="incident in profile.behavior"
              :key="incident.id"
              class="flex flex-col gap-1 px-4 py-2.5"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="flex items-center gap-2">
                  <StatusBadge :status="incident.type" />
                  <span class="text-caption text-ink-secondary">
                    Severity {{ incident.severityLevel }}/5
                  </span>
                </span>
                <span class="text-caption text-ink-secondary">
                  {{ formatDayMonthYear(incident.incidentDate) ?? incident.incidentDate }} ·
                  {{ incident.teacherName }}
                </span>
              </div>
              <p class="text-body text-ink">{{ incident.description }}</p>
              <p v-if="incident.actionTaken" class="text-caption text-ink-secondary">
                Action taken: {{ incident.actionTaken }}
              </p>
            </li>
          </ul>
        </div>
      </template>

      <!-- Teacher profile -->
      <template v-else-if="profile.kind === 'teacher'">
        <div class="rounded-sm border border-hairline p-3">
          <div class="flex items-center justify-between gap-2">
            <p class="text-badge font-semibold uppercase tracking-wide text-ink-secondary">
              Specialization
            </p>
            <button
              v-if="can('academics.manage') && profile.teacherId && editMode !== 'teacher'"
              type="button"
              class="text-caption font-medium text-brass hover:underline"
              @click="startEditTeacher"
            >
              Edit
            </button>
          </div>
          <template v-if="editMode === 'teacher'">
            <input
              v-model="editSpecialization"
              type="text"
              placeholder="e.g. Mathematics & Physics"
              class="mt-1.5 w-full rounded-sm border border-hairline bg-surface px-2.5 py-1.5 text-body text-ink focus:border-brass focus:outline-none"
            />
            <div class="mt-2 flex items-center gap-2">
              <AppButton size="sm" :disabled="isSavingEdit" @click="saveEdit">
                {{ isSavingEdit ? 'Saving…' : 'Save' }}
              </AppButton>
              <AppButton size="sm" variant="secondary" @click="editMode = null">Cancel</AppButton>
            </div>
            <p v-if="editError" class="mt-1.5 text-caption text-danger-text">{{ editError }}</p>
          </template>
          <p v-else class="mt-1 text-body font-medium text-ink">
            {{ profile.specialization ?? 'Not specified' }}
          </p>
        </div>

        <div>
          <h4 class="mb-2 text-caption font-semibold uppercase tracking-wide text-ink-secondary">
            Teaching assignments{{ profile.termName ? ` · ${profile.termName}` : '' }}
          </h4>
          <p v-if="profile.assignments.length === 0" class="text-body text-ink-secondary">
            No teaching assignments for the active term.
          </p>
          <ul v-else class="divide-y divide-hairline rounded-sm border border-hairline">
            <li
              v-for="item in profile.assignments"
              :key="item.id"
              class="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <span class="text-body font-medium text-ink">
                {{ item.subjectName }}
                <span class="ml-1.5 text-caption font-normal text-ink-secondary">
                  {{ item.subjectCode }}
                </span>
              </span>
              <span class="text-caption text-ink-secondary">
                {{ item.sectionName ?? 'Specialist' }}
              </span>
            </li>
          </ul>
        </div>

        <div>
          <h4 class="mb-2 text-caption font-semibold uppercase tracking-wide text-ink-secondary">
            Weekly timetable{{ profile.termName ? ` · ${profile.termName}` : '' }}
          </h4>
          <p v-if="profile.schedule.length === 0" class="text-body text-ink-secondary">
            No lessons scheduled on the timetable yet.
          </p>
          <ul v-else class="divide-y divide-hairline rounded-sm border border-hairline">
            <li
              v-for="slot in profile.schedule"
              :key="slot.id"
              class="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
            >
              <div>
                <p class="text-body font-medium text-ink">
                  {{ slot.dayOfWeek }} · {{ slot.periodName }}
                  <span class="text-caption font-normal text-ink-secondary">
                    ({{ slot.startTime }}–{{ slot.endTime }})
                  </span>
                </p>
                <p class="text-caption text-ink-secondary">
                  {{ slot.subjectName }} · {{ slot.sectionName }}
                </p>
              </div>
              <span class="text-caption font-medium text-ink-secondary">{{ slot.classroomName }}</span>
            </li>
          </ul>
        </div>
      </template>

      <!-- Staff profile -->
      <template v-else-if="profile.kind === 'staff'">
        <div v-if="editMode === 'staff'" class="rounded-sm border border-hairline p-4">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="text-badge font-semibold uppercase tracking-wide text-ink-secondary">
                Job title
              </label>
              <input
                v-model="editJobTitle"
                type="text"
                class="mt-1 w-full rounded-sm border border-hairline bg-surface px-2.5 py-1.5 text-body text-ink focus:border-brass focus:outline-none"
              />
            </div>
            <div>
              <label class="text-badge font-semibold uppercase tracking-wide text-ink-secondary">
                Department
              </label>
              <input
                v-model="editDepartment"
                type="text"
                class="mt-1 w-full rounded-sm border border-hairline bg-surface px-2.5 py-1.5 text-body text-ink focus:border-brass focus:outline-none"
              />
            </div>
          </div>
          <div class="mt-3 flex items-center gap-2">
            <AppButton size="sm" :disabled="isSavingEdit" @click="saveEdit">
              {{ isSavingEdit ? 'Saving…' : 'Save' }}
            </AppButton>
            <AppButton size="sm" variant="secondary" @click="editMode = null">Cancel</AppButton>
          </div>
          <p v-if="editError" class="mt-1.5 text-caption text-danger-text">{{ editError }}</p>
        </div>
        <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div class="rounded-sm border border-hairline p-3">
            <div class="flex items-center justify-between gap-2">
              <p class="text-badge font-semibold uppercase tracking-wide text-ink-secondary">
                Job title
              </p>
              <button
                v-if="can('academics.manage') && profile.staffId"
                type="button"
                class="text-caption font-medium text-brass hover:underline"
                @click="startEditStaff"
              >
                Edit
              </button>
            </div>
            <p class="mt-1 text-body font-medium text-ink">
              {{ profile.jobTitle ?? '—' }}
            </p>
          </div>
          <div class="rounded-sm border border-hairline p-3">
            <p class="text-badge font-semibold uppercase tracking-wide text-ink-secondary">
              Department
            </p>
            <p class="mt-1 text-body font-medium text-ink">
              {{ profile.department ?? '—' }}
            </p>
          </div>
        </div>
      </template>

      <!-- Parent / admin profile -->
      <template v-else>
        <div>
          <h4 class="mb-2 text-caption font-semibold uppercase tracking-wide text-ink-secondary">
            Linked students
          </h4>
          <p v-if="profile.children.length === 0" class="text-body text-ink-secondary">
            {{
              profile.role === 'admin'
                ? 'Administrator account.'
                : 'No students linked to this parent yet.'
            }}
          </p>
          <ul v-else class="divide-y divide-hairline rounded-sm border border-hairline">
            <li
              v-for="child in profile.children"
              :key="child.studentId"
              class="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <div>
                <p class="text-body font-medium text-ink">{{ child.fullName }}</p>
                <p class="text-caption text-ink-secondary">
                  {{ child.sectionName ?? 'Unassigned' }} ·
                  Born {{ formatDayMonthYear(child.dateOfBirth) ?? child.dateOfBirth }}
                </p>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-md px-2 py-1 text-caption font-medium text-brass hover:bg-page"
                @click="$emit('selectUser', child.userId)"
              >View student profile</button>
            </li>
          </ul>
        </div>
      </template>
    </div>

    <template #footer>
      <AppButton variant="secondary" @click="open = false">Close</AppButton>
    </template>
  </AppModal>
</template>
