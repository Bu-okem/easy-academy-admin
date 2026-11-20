<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

type PopoverName = 'switcher' | 'role' | 'search' | 'notifications' | null
const activePopover = defineModel<PopoverName>('active', { required: true })

const { data: attention, isPending: attentionPending } = useConvexQuery(api.overview.attention)

const query = ref('')
const searchTerm = computed(() => (query.value.trim().length >= 2 ? query.value.trim() : ''))
const { data: searchResults, isPending: searchPending } = useConvexQuery(
  api.people.search,
  computed(() => ({ term: searchTerm.value }))
)

const unreadCount = computed(() => attention.value?.length ?? 0)
const showSearchResults = computed(
  () => activePopover.value === 'search' && query.value.trim().length >= 2
)
const notificationsOpen = computed(() => activePopover.value === 'notifications')

function openSearch() {
  activePopover.value = 'search'
}

function toggleNotifications() {
  activePopover.value = notificationsOpen.value ? null : 'notifications'
}

async function openDestination(to: string, clearSearch = false) {
  activePopover.value = null
  if (clearSearch) query.value = ''
  await navigateTo(to)
}

function submitSearch() {
  const first = searchResults.value?.[0]
  if (first) openDestination(first.to, true)
}

const attentionIcons: Record<string, string> = {
  registerNotTaken: 'clipboard',
  registerIncomplete: 'clipboard',
  studentsAbsent: 'users',
}
</script>

<template>
  <div class="flex min-w-0 flex-1 items-center gap-6">
    <!-- Global search -->
    <form class="relative mx-auto w-full max-w-[520px]" @submit.prevent="submitSearch">
      <AppIcon
        name="search"
        class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-secondary"
      />
      <input
        v-model="query"
        type="search"
        placeholder="Search students, staff, classes..."
        aria-label="Search students, staff, and classes"
        class="h-10 w-full rounded-full bg-page pl-11 pr-4 text-body text-ink placeholder:text-ink-secondary"
        @focus="openSearch"
      >

      <div
        v-if="showSearchResults"
        class="absolute left-0 right-0 top-full z-30 mt-2 rounded-lg border border-hairline bg-surface p-2 shadow-dropdown"
      >
        <p v-if="searchPending && !searchResults" class="px-3 py-2 text-caption text-ink-secondary">
          Searching…
        </p>
        <ul v-else-if="searchResults && searchResults.length > 0" class="flex flex-col gap-0.5">
          <li v-for="item in searchResults" :key="item.id">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left transition-colors hover:bg-page"
              @click="openDestination(item.to, true)"
            >
              <span class="min-w-0">
                <span class="block truncate text-body font-medium text-ink">{{ item.label }}</span>
                <span class="block truncate text-caption text-ink-secondary">{{ item.detail }}</span>
              </span>
              <span class="shrink-0 text-caption font-medium text-brass">View</span>
            </button>
          </li>
        </ul>
        <p v-else class="px-3 py-2 text-caption text-ink-secondary">
          No matching students, staff, or classes.
        </p>
      </div>
    </form>

    <!-- Notifications bell -->
    <div class="relative shrink-0">
      <button
        type="button"
        class="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-secondary transition-colors hover:bg-page"
        :aria-label="`Notifications, ${unreadCount} unread`"
        :aria-expanded="notificationsOpen"
        @click="toggleNotifications"
      >
        <AppIcon name="bell" />
        <span
          v-if="unreadCount"
          class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-negative-text px-1 text-[10px] font-semibold leading-none text-white"
        >{{ unreadCount }}</span>
      </button>

      <div
        v-if="notificationsOpen"
        class="absolute right-0 top-full z-30 mt-2 w-96 rounded-lg border border-hairline bg-surface p-4 shadow-dropdown"
      >
        <div class="mb-2 flex items-center justify-between">
          <h2 class="font-display text-body font-medium text-ink">Needs attention</h2>
          <span class="text-caption text-ink-secondary">{{ unreadCount }}</span>
        </div>

        <p v-if="attentionPending" class="py-3 text-caption text-ink-secondary">
          Checking registers…
        </p>

        <ul v-else-if="attention && attention.length > 0" class="max-h-80 overflow-y-auto">
          <li
            v-for="item in attention"
            :key="item.id"
            class="border-b border-hairline last:border-b-0"
          >
            <button
              type="button"
              class="flex w-full items-start gap-3 py-2.5 text-left transition-colors hover:bg-page"
              @click="
                openDestination(
                  item.sectionId ? `/operations?section=${item.sectionId}` : '/people?tab=students'
                )
              "
            >
              <span
                class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                :class="
                  item.severity === 'warning'
                    ? 'bg-negative-bg text-negative-text'
                    : 'bg-brass-tint text-brass-dark'
                "
              >
                <AppIcon :name="attentionIcons[item.kind] ?? 'alert'" :size="18" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-body font-medium text-ink">{{ item.title }}</span>
                <span class="mt-0.5 block text-caption text-ink-secondary">{{ item.detail }}</span>
              </span>
            </button>
          </li>
        </ul>

        <p v-else class="py-3 text-caption text-ink-secondary">
          Every register is taken and nobody is absent.
        </p>
      </div>
    </div>
  </div>
</template>
