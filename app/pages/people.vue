<script setup lang="ts">
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'
import type { TabDefinition } from '~/components/AppTabs.vue'

const tabs = [
  { key: 'students', label: 'Students' },
  { key: 'teachers', label: 'Teachers' },
  { key: 'staff', label: 'Staff' },
  { key: 'families', label: 'Families' },
] as const satisfies readonly TabDefinition[]

type TabKey = (typeof tabs)[number]['key']

const route = useRoute()
const router = useRouter()
const { can } = useViewer()

// The tab lives in the URL so a view can be linked, bookmarked and survive a
// refresh - an administrator sharing "the staff list" should not send a
// colleague to the students tab.
const activeTab = computed<TabKey>({
  get() {
    const raw = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab
    return tabs.some((tab) => tab.key === raw) ? (raw as TabKey) : 'students'
  },
  set(key) {
    router.replace({ query: { ...route.query, tab: key } })
  },
})

// Totals for the pagination footers. A cursor page knows nothing about how many
// rows lie beyond it, so the counts come separately.
const { data: counts } = useConvexQuery(api.people.counts)
const { data: options } = useConvexQuery(api.people.enrollmentOptions)
const { data: teachers } = useConvexQuery(api.people.teacherOptions)

const { mutate: createStudent, isPending: savingStudent } = useConvexMutation(
  api.people.createStudent
)
const { mutate: enrollStudentSubject, isPending: savingElective } = useConvexMutation(
  api.people.enrollStudentSubject
)
const { mutate: createTeacher, isPending: savingTeacher } = useConvexMutation(
  api.people.createTeacher
)
const { mutate: assignTeacher, isPending: savingAssignment } = useConvexMutation(
  api.people.assignTeacher
)
const { mutate: createStaff, isPending: savingStaff } = useConvexMutation(api.people.createStaff)
const { mutate: linkParent, isPending: savingParent } = useConvexMutation(api.people.linkParent)

const sectionOptions = computed(() =>
  (options.value?.sections ?? []).map((section) => ({ value: section.id, label: section.name }))
)
const assignSectionOptions = computed(() => [
  { value: '', label: 'Specialist (no specific class)' },
  ...sectionOptions.value,
])
const subjectOptions = computed(() =>
  (options.value?.subjects ?? []).map((subject) => ({
    value: subject.id,
    label: `${subject.name} (${subject.code})`,
  }))
)
const studentOptions = computed(() =>
  (options.value?.students ?? []).map((student) => ({ value: student.id, label: student.name }))
)
const teacherOptions = computed(() =>
  (teachers.value ?? []).map((teacher) => ({ value: teacher.id, label: teacher.name }))
)

const problem = ref<string | null>(null)

function messageFrom(error: unknown): string {
  const data = (error as { data?: unknown })?.data
  if (data && typeof data === 'object' && 'message' in data) return String(data.message)
  return 'That could not be saved. Please try again.'
}

async function attempt(action: () => Promise<unknown>, onDone: () => void) {
  problem.value = null
  try {
    await action()
    onDone()
  } catch (error) {
    problem.value = messageFrom(error)
  }
}

// --- Enroll student ----------------------------------------------------------
const studentDialog = ref(false)
const studentName = ref('')
const studentEmail = ref('')
const studentDob = ref('')
const studentSectionId = ref('')
watch(studentDialog, (open) => {
  if (!open) return
  studentName.value = ''
  studentEmail.value = ''
  studentDob.value = ''
  studentSectionId.value = sectionOptions.value[0]?.value ?? ''
  problem.value = null
})
const saveStudent = () =>
  attempt(
    () =>
      createStudent({
        fullName: studentName.value,
        email: studentEmail.value,
        dateOfBirth: studentDob.value,
        classSectionId: studentSectionId.value as Id<'classSections'>,
      }),
    () => (studentDialog.value = false)
  )

// --- Add elective subject ---------------------------------------------------
const electiveDialog = ref(false)
const electiveStudentId = ref('')
const electiveSubjectId = ref('')
watch(electiveDialog, (open) => {
  if (!open) return
  electiveStudentId.value = studentOptions.value[0]?.value ?? ''
  electiveSubjectId.value = subjectOptions.value[0]?.value ?? ''
  problem.value = null
})
const saveElective = () =>
  attempt(
    () =>
      enrollStudentSubject({
        studentId: electiveStudentId.value as Id<'students'>,
        subjectId: electiveSubjectId.value as Id<'subjects'>,
      }),
    () => (electiveDialog.value = false)
  )

// --- Add teacher ------------------------------------------------------------
const teacherDialog = ref(false)
const teacherName = ref('')
const teacherEmail = ref('')
const teacherSpecialization = ref('')
watch(teacherDialog, (open) => {
  if (!open) return
  teacherName.value = ''
  teacherEmail.value = ''
  teacherSpecialization.value = ''
  problem.value = null
})
const saveTeacher = () =>
  attempt(
    () =>
      createTeacher({
        fullName: teacherName.value,
        email: teacherEmail.value,
        specialization:
          teacherSpecialization.value.trim() === '' ? undefined : teacherSpecialization.value,
      }),
    () => (teacherDialog.value = false)
  )

// --- Assign teacher ---------------------------------------------------------
const assignDialog = ref(false)
const assignTeacherId = ref('')
const assignSubjectId = ref('')
const assignSectionId = ref('')
watch(assignDialog, (open) => {
  if (!open) return
  assignTeacherId.value = teacherOptions.value[0]?.value ?? ''
  assignSubjectId.value = subjectOptions.value[0]?.value ?? ''
  assignSectionId.value = ''
  problem.value = null
})
const saveAssignment = () =>
  attempt(
    () =>
      assignTeacher({
        teacherId: assignTeacherId.value as Id<'teachers'>,
        subjectId: assignSubjectId.value as Id<'subjects'>,
        classSectionId:
          assignSectionId.value === ''
            ? undefined
            : (assignSectionId.value as Id<'classSections'>),
      }),
    () => (assignDialog.value = false)
  )

// --- Add staff --------------------------------------------------------------
const staffDialog = ref(false)
const staffName = ref('')
const staffEmail = ref('')
const staffJobTitle = ref('')
const staffDepartment = ref('')
watch(staffDialog, (open) => {
  if (!open) return
  staffName.value = ''
  staffEmail.value = ''
  staffJobTitle.value = ''
  staffDepartment.value = ''
  problem.value = null
})
const saveStaff = () =>
  attempt(
    () =>
      createStaff({
        fullName: staffName.value,
        email: staffEmail.value,
        jobTitle: staffJobTitle.value,
        department: staffDepartment.value,
      }),
    () => (staffDialog.value = false)
  )

// --- Link parent & student --------------------------------------------------
const parentDialog = ref(false)
const parentName = ref('')
const parentEmail = ref('')
const parentStudentId = ref('')
watch(parentDialog, (open) => {
  if (!open) return
  parentName.value = ''
  parentEmail.value = ''
  parentStudentId.value = studentOptions.value[0]?.value ?? ''
  problem.value = null
})
const saveParent = () =>
  attempt(
    () =>
      linkParent({
        fullName: parentName.value,
        email: parentEmail.value,
        studentId: parentStudentId.value as Id<'students'>,
      }),
    () => (parentDialog.value = false)
  )

// --- Individual profile modal -----------------------------------------------
const profileUserId = ref<Id<'users'> | null>(
  typeof route.query.profile === 'string' && route.query.profile !== ''
    ? (route.query.profile as Id<'users'>)
    : null
)
const profileOpen = ref(Boolean(profileUserId.value))

function openProfile(userId: Id<'users'>) {
  profileUserId.value = userId
  profileOpen.value = true
  if (route.query.profile !== userId) {
    router.replace({ query: { ...route.query, profile: userId } })
  }
}

watch(
  () => route.query.profile,
  (profile) => {
    if (typeof profile === 'string' && profile !== '') {
      profileUserId.value = profile as Id<'users'>
      profileOpen.value = true
    } else {
      profileOpen.value = false
      profileUserId.value = null
    }
  }
)

watch(profileOpen, (isOpen) => {
  if (isOpen) return
  profileUserId.value = null
  if ('profile' in route.query) {
    const { profile: _, ...rest } = route.query
    router.replace({ query: rest })
  }
})

// Each tab's table owns its own paginated subscription and is mounted only while
// its tab is active, so exactly one live query runs at a time and switching tabs
// starts that list cleanly at page one.
useHead({ title: 'People' })
</script>

<template>
  <div>
    <PageHeader title="People" caption="Students, teachers, staff and families" />

    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <AppTabs v-model="activeTab" :tabs="tabs" label="People categories" id-prefix="people" />

      <div v-if="can('academics.manage')" class="flex flex-wrap items-center gap-2">
        <template v-if="activeTab === 'students'">
          <AppButton variant="secondary" :disabled="studentOptions.length === 0 || subjectOptions.length === 0"
            @click="electiveDialog = true">Add elective subject</AppButton>
          <AppButton :disabled="sectionOptions.length === 0" @click="studentDialog = true">Enroll student</AppButton>
        </template>

        <template v-else-if="activeTab === 'teachers'">
          <AppButton variant="secondary" :disabled="teacherOptions.length === 0 || subjectOptions.length === 0"
            @click="assignDialog = true">Assign class / subject</AppButton>
          <AppButton @click="teacherDialog = true">Add teacher</AppButton>
        </template>

        <AppButton v-else-if="activeTab === 'staff'" @click="staffDialog = true">
          Add staff member
        </AppButton>

        <AppButton v-else :disabled="studentOptions.length === 0" @click="parentDialog = true">Link parent &amp; student
        </AppButton>
      </div>
    </div>

    <div role="tabpanel" :aria-labelledby="`people-tab-${activeTab}`">
      <PeopleStudentsTable
        v-if="activeTab === 'students'"
        :total="counts?.students"
        @select="openProfile"
      />
      <PeopleTeachersTable
        v-else-if="activeTab === 'teachers'"
        :total="counts?.teachers"
        @select="openProfile"
      />
      <PeopleStaffTable
        v-else-if="activeTab === 'staff'"
        :total="counts?.staff"
        @select="openProfile"
      />
      <PeopleFamiliesTable
        v-else
        :total="counts?.families"
        @select="openProfile"
      />
    </div>

    <PeopleProfileDialog
      v-if="profileUserId"
      v-model:open="profileOpen"
      :user-id="profileUserId"
      @select-user="openProfile"
    />

    <!-- Modals -->
    <AppModal v-model:open="studentDialog" title="Enroll student">
      <form class="flex flex-col gap-4" @submit.prevent="saveStudent">
        <AppInput v-model="studentName" label="Full name" placeholder="Adaeze Okonkwo" />
        <AppInput v-model="studentEmail" label="Email" placeholder="adaeze.okonkwo@easyacademy.test" />
        <AppInput v-model="studentDob" label="Date of birth" placeholder="YYYY-MM-DD" />
        <AppSelect v-model="studentSectionId" label="Class section" placeholder="Choose a class"
          :options="sectionOptions" />
        <p v-if="problem" class="rounded-sm bg-negative-bg px-3 py-2 text-caption text-negative-text">
          {{ problem }}
        </p>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="studentDialog = false">Cancel</AppButton>
        <AppButton :disabled="savingStudent ||
          studentName.trim() === '' ||
          studentEmail.trim() === '' ||
          studentDob.trim() === '' ||
          studentSectionId === ''
          " @click="saveStudent">{{ savingStudent ? 'Enrolling…' : 'Enrol student' }}</AppButton>
      </template>
    </AppModal>

    <AppModal v-model:open="electiveDialog" title="Add elective subject">
      <form class="flex flex-col gap-4" @submit.prevent="saveElective">
        <AppSelect v-model="electiveStudentId" label="Student" placeholder="Choose a student"
          :options="studentOptions" />
        <AppSelect v-model="electiveSubjectId" label="Subject" placeholder="Choose a subject"
          :options="subjectOptions" />
        <p v-if="problem" class="rounded-sm bg-negative-bg px-3 py-2 text-caption text-negative-text">
          {{ problem }}
        </p>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="electiveDialog = false">Cancel</AppButton>
        <AppButton :disabled="savingElective || electiveStudentId === '' || electiveSubjectId === ''"
          @click="saveElective">{{ savingElective ? 'Adding…' : 'Add elective' }}</AppButton>
      </template>
    </AppModal>

    <AppModal v-model:open="teacherDialog" title="Add teacher">
      <form class="flex flex-col gap-4" @submit.prevent="saveTeacher">
        <AppInput v-model="teacherName" label="Full name" placeholder="Olumide Bankole" />
        <AppInput v-model="teacherEmail" label="Email" placeholder="olumide.bankole@easyacademy.test" />
        <AppInput v-model="teacherSpecialization" label="Specialization" placeholder="Sciences (optional)" />
        <p v-if="problem" class="rounded-sm bg-negative-bg px-3 py-2 text-caption text-negative-text">
          {{ problem }}
        </p>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="teacherDialog = false">Cancel</AppButton>
        <AppButton :disabled="savingTeacher || teacherName.trim() === '' || teacherEmail.trim() === ''"
          @click="saveTeacher">{{ savingTeacher ? 'Adding…' : 'Add teacher' }}</AppButton>
      </template>
    </AppModal>

    <AppModal v-model:open="assignDialog" title="Assign class or subject">
      <form class="flex flex-col gap-4" @submit.prevent="saveAssignment">
        <AppSelect v-model="assignTeacherId" label="Teacher" placeholder="Choose a teacher" :options="teacherOptions" />
        <AppSelect v-model="assignSubjectId" label="Subject" placeholder="Choose a subject" :options="subjectOptions" />
        <AppSelect v-model="assignSectionId" label="Class section" :options="assignSectionOptions" />
        <p v-if="problem" class="rounded-sm bg-negative-bg px-3 py-2 text-caption text-negative-text">
          {{ problem }}
        </p>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="assignDialog = false">Cancel</AppButton>
        <AppButton :disabled="savingAssignment || assignTeacherId === '' || assignSubjectId === ''"
          @click="saveAssignment">{{ savingAssignment ? 'Assigning…' : 'Save assignment' }}</AppButton>
      </template>
    </AppModal>

    <AppModal v-model:open="staffDialog" title="Add staff member">
      <form class="flex flex-col gap-4" @submit.prevent="saveStaff">
        <AppInput v-model="staffName" label="Full name" placeholder="Amara Chukwu" />
        <AppInput v-model="staffEmail" label="Email" placeholder="amara.chukwu@easyacademy.test" />
        <AppInput v-model="staffJobTitle" label="Job title" placeholder="Accountant" />
        <AppInput v-model="staffDepartment" label="Department" placeholder="Finance" />
        <p v-if="problem" class="rounded-sm bg-negative-bg px-3 py-2 text-caption text-negative-text">
          {{ problem }}
        </p>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="staffDialog = false">Cancel</AppButton>
        <AppButton :disabled="savingStaff ||
          staffName.trim() === '' ||
          staffEmail.trim() === '' ||
          staffJobTitle.trim() === '' ||
          staffDepartment.trim() === ''
          " @click="saveStaff">{{ savingStaff ? 'Adding…' : 'Add staff member' }}</AppButton>
      </template>
    </AppModal>

    <AppModal v-model:open="parentDialog" title="Link parent &amp; student">
      <form class="flex flex-col gap-4" @submit.prevent="saveParent">
        <AppInput v-model="parentEmail" label="Parent email" placeholder="ngozi.okonkwo@easyacademy.test"
          hint="Matches an existing parent by email, or creates a new parent record." />
        <AppInput v-model="parentName" label="Parent full name" placeholder="Ngozi Okonkwo"
          hint="Required when creating a new parent account." />
        <AppSelect v-model="parentStudentId" label="Student" placeholder="Choose a student" :options="studentOptions" />
        <p v-if="problem" class="rounded-sm bg-negative-bg px-3 py-2 text-caption text-negative-text">
          {{ problem }}
        </p>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="parentDialog = false">Cancel</AppButton>
        <AppButton :disabled="savingParent || parentEmail.trim() === '' || parentStudentId === ''" @click="saveParent">
          {{ savingParent ? 'Linking…' : 'Link family' }}</AppButton>
      </template>
    </AppModal>
  </div>
</template>
