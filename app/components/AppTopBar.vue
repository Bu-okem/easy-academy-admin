<script setup lang="ts">
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'
import type { ViewerRole } from '~/composables/useViewer'

// DESIGN.md 5.2 - 64px bar: term switcher, global search, bell, role switcher, avatar.
const { data: calendar, isPending: calendarPending } = useConvexQuery(api.calendar.active)
const { mutate: activateYear, isPending: switchingYear } = useConvexMutation(
  api.academics.activateYear
)

const { role, isSwitching, can, canSwitchRole, switchRole } = useViewer()

const roleChoices: ReadonlyArray<{ value: ViewerRole; label: string; hint: string }> = [
  { value: 'admin', label: 'Admin (Principal)', hint: 'Full control, publish & principal remarks' },
  { value: 'teacher', label: 'Teacher', hint: 'Registers, marks & form/subject remarks' },
  { value: 'staff', label: 'Staff', hint: 'Read-only directory, timetable & results' },
  { value: 'parent', label: 'Family (Parent)', hint: 'Children, attendance, timetable & published cards' },
  { value: 'student', label: 'Student', hint: 'Own timetable, attendance & published card' },
]

const currentRoleLabel = computed(
  () => roleChoices.find((choice) => choice.value === role.value)?.label ?? 'Role'
)

const headerRef = ref<HTMLElement | null>(null)
const activePopover = ref<'switcher' | 'role' | 'search' | 'notifications' | null>(null)
const switchProblem = ref<string | null>(null)
const roleProblem = ref<string | null>(null)

const switcherOpen = computed(() => activePopover.value === 'switcher')
const roleOpen = computed(() => activePopover.value === 'role')

function closeAll() {
  activePopover.value = null
}

function toggleSwitcher() {
  switchProblem.value = null
  activePopover.value = switcherOpen.value ? null : 'switcher'
}

function toggleRoleMenu() {
  roleProblem.value = null
  activePopover.value = roleOpen.value ? null : 'role'
}

function messageFrom(error: unknown): string {
  const data = (error as { data?: unknown })?.data
  if (data && typeof data === 'object' && 'message' in data) return String(data.message)
  return 'That could not be changed. Please try again.'
}

async function selectYear(yearId: Id<'academicYears'>) {
  switchProblem.value = null
  try {
    await activateYear({ yearId })
    activePopover.value = null
  } catch (error) {
    switchProblem.value = messageFrom(error)
  }
}

async function selectRole(targetRole: ViewerRole) {
  roleProblem.value = null
  activePopover.value = null
  try {
    await switchRole(targetRole)
  } catch (error) {
    roleProblem.value = messageFrom(error)
  }
}

function handleOutsideClick(event: MouseEvent) {
  if (!headerRef.value || !(event.target instanceof Node)) return
  if (!headerRef.value.contains(event.target)) closeAll()
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick)
})

// The signed-in person, when Clerk can tell us. Before it is configured there is
// nobody to name, and inventing one would misrepresent who is looking at the
// school's records.
const user = (() => {
  try {
    return useUser().user
  } catch {
    return ref(null)
  }
})()

const isClerkSignedIn = computed(() => Boolean(user.value))
</script>

<template>
  <header
    ref="headerRef"
    class="relative z-20 flex h-16 shrink-0 items-center gap-6 border-b border-hairline bg-surface px-8"
    @keydown.escape="closeAll"
  >
    <!-- Term / year switcher -->
    <div class="relative shrink-0">
      <button
        type="button"
        class="flex h-9 items-center gap-2 rounded-full border border-hairline bg-surface px-4 text-body text-ink transition-colors hover:bg-page"
        :aria-expanded="switcherOpen"
        aria-haspopup="listbox"
        @click="toggleSwitcher"
      >
        <!-- Pending is not the same as absent: claiming "no active year" before
             the query answers would state something untrue. -->
        <span v-if="calendarPending" class="h-3 w-28 animate-pulse rounded-full bg-page" />
        <template v-else-if="calendar">
          <span>{{ calendar.academicYear }}</span>
          <template v-if="calendar.term">
            <span class="text-ink-disabled" aria-hidden="true">·</span>
            <span class="font-medium">{{ calendar.term }}</span>
          </template>
        </template>
        <span v-else class="text-ink-secondary">No active year</span>
        <AppIcon name="chevronDown" :size="16" class="text-ink-secondary" />
      </button>

      <div
        v-if="switcherOpen"
        role="listbox"
        aria-label="Academic year and terms"
        class="absolute left-0 top-full z-30 mt-2 w-72 rounded-lg border border-hairline bg-surface p-3 shadow-dropdown"
      >
        <p v-if="calendarPending" class="px-2 py-2 text-caption text-ink-secondary">
          Loading calendar…
        </p>

        <template v-else-if="calendar">
          <div v-if="calendar.terms.length > 0" class="mb-3">
            <p class="px-2 pb-1 text-badge font-semibold uppercase tracking-wide text-ink-secondary">
              Terms · {{ calendar.academicYear }}
            </p>
            <ul class="flex flex-col gap-0.5">
              <li
                v-for="term in calendar.terms"
                :key="term.id"
                class="flex items-center justify-between rounded-sm px-2 py-1.5 text-body"
                :class="term.id === calendar.termId ? 'bg-page font-medium text-ink' : 'text-ink-secondary'"
              >
                <span>{{ term.name }}</span>
                <span v-if="term.id === calendar.termId" class="text-badge font-semibold text-brass-dark">
                  Current
                </span>
              </li>
            </ul>
          </div>

          <div v-if="calendar.years.length > 0" class="border-t border-hairline pt-2.5">
            <p class="px-2 pb-1 text-badge font-semibold uppercase tracking-wide text-ink-secondary">
              Academic years
            </p>
            <ul class="flex flex-col gap-0.5">
              <li v-for="year in calendar.years" :key="year.id">
                <div
                  v-if="year.isActive"
                  class="flex items-center justify-between rounded-sm bg-page px-2 py-1.5 text-body font-medium text-ink"
                >
                  <span>{{ year.name }}</span>
                  <span class="text-badge font-semibold text-positive-text">Active</span>
                </div>
                <button
                  v-else-if="can('academics.manage')"
                  type="button"
                  :disabled="switchingYear"
                  class="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-body text-ink transition-colors hover:bg-page disabled:text-ink-disabled"
                  @click="selectYear(year.id)"
                >
                  <span>{{ year.name }}</span>
                  <span class="text-caption font-medium text-brass">Activate</span>
                </button>
                <div
                  v-else
                  class="flex items-center justify-between rounded-sm px-2 py-1.5 text-body text-ink-secondary"
                >
                  <span>{{ year.name }}</span>
                </div>
              </li>
            </ul>
          </div>

          <p
            v-if="switchProblem"
            class="mt-2 rounded-sm bg-negative-bg px-2.5 py-1.5 text-caption text-negative-text"
          >
            {{ switchProblem }}
          </p>
        </template>

        <p v-else class="px-2 py-2 text-caption text-ink-secondary">
          No academic year is active yet.
        </p>

        <div v-if="can('academics.manage')" class="mt-2.5 border-t border-hairline pt-2">
          <NuxtLink
            to="/academics?tab=calendar"
            class="block rounded-sm px-2 py-1.5 text-caption font-medium text-brass transition-colors hover:bg-page"
            @click="closeAll"
          >
            Manage years &amp; terms
          </NuxtLink>
        </div>
      </div>
    </div>

    <AppTopBarStaffTools
      v-if="can('overview.view')"
      v-model:active="activePopover"
    />

    <div class="ml-auto flex shrink-0 items-center gap-3">
      <!-- Role preview switcher for admin accounts -->
      <div v-if="canSwitchRole" class="relative">
        <button
          type="button"
          :disabled="isSwitching"
          class="flex h-9 items-center gap-2 rounded-full border border-hairline bg-surface px-3.5 text-caption text-ink transition-colors hover:bg-page disabled:text-ink-disabled"
          :aria-expanded="roleOpen"
          aria-haspopup="listbox"
          @click="toggleRoleMenu"
        >
          <span class="text-ink-secondary">View as:</span>
          <span class="font-medium">{{ isSwitching ? 'Switching…' : currentRoleLabel }}</span>
          <AppIcon name="chevronDown" :size="16" class="text-ink-secondary" />
        </button>

        <div
          v-if="roleOpen"
          role="listbox"
          aria-label="Preview role"
          class="absolute right-0 top-full z-30 mt-2 w-72 rounded-lg border border-hairline bg-surface p-2 shadow-dropdown"
        >
          <p class="px-2.5 pb-1.5 text-badge font-semibold uppercase tracking-wide text-ink-secondary">
            Switch preview role
          </p>
          <ul class="flex flex-col gap-0.5">
            <li v-for="choice in roleChoices" :key="choice.value">
              <button
                type="button"
                class="flex w-full items-start justify-between gap-2 rounded-sm px-2.5 py-2 text-left transition-colors"
                :class="choice.value === role ? 'bg-page font-medium text-ink' : 'hover:bg-page'"
                @click="selectRole(choice.value)"
              >
                <span>
                  <span class="block text-body text-ink">{{ choice.label }}</span>
                  <span class="block text-caption text-ink-secondary">{{ choice.hint }}</span>
                </span>
                <span
                  v-if="choice.value === role"
                  class="mt-0.5 shrink-0 text-badge font-semibold text-brass-dark"
                >
                  Active
                </span>
              </button>
            </li>
          </ul>
          <p
            v-if="roleProblem"
            class="mt-2 rounded-sm bg-negative-bg px-2.5 py-1.5 text-caption text-negative-text"
          >
            {{ roleProblem }}
          </p>
        </div>
      </div>

      <ClientOnly>
        <UserButton v-if="isClerkSignedIn" />
        <AppAvatar v-else name="?" :size="36" :title="'Not signed in'" />
        <template #fallback>
          <span class="h-9 w-9 animate-pulse rounded-full bg-page" />
        </template>
      </ClientOnly>
    </div>
  </header>
</template>
