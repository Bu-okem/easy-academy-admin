<script setup lang="ts">
import type { ViewerCapability } from '~/composables/useViewer'

const { role, isPending, isPortalRole, can } = useViewer()

// DESIGN.md 5.1 - 240px, full height, filtered by caller capabilities.
const staffNav: ReadonlyArray<{ label: string; to: string; capability: ViewerCapability }> = [
  { label: 'Overview', to: '/', capability: 'overview.view' },
  { label: 'People', to: '/people', capability: 'people.view' },
  { label: 'Academics', to: '/academics', capability: 'academics.manage' },
  { label: 'Timetable', to: '/timetable', capability: 'timetable.view' },
  { label: 'Operations', to: '/operations', capability: 'register.take' },
  { label: 'Results', to: '/results', capability: 'results.view' },
]

const nav = computed(() => {
  if (isPortalRole.value) {
    return [{ label: role.value === 'parent' ? 'Family Portal' : 'Student Portal', to: '/' }]
  }
  return staffNav.filter((item) => can(item.capability))
})
</script>

<template>
  <aside class="flex w-sidebar shrink-0 flex-col bg-sidebar-bg">
    <div class="px-6 py-8">
      <NuxtLink
        to="/"
        class="whitespace-nowrap font-display text-wordmark font-medium tracking-tight text-white"
      >
        Easy Academy Admin
      </NuxtLink>
    </div>

    <nav class="flex flex-col gap-1 px-4">
      <template v-if="isPending && nav.length === 0">
        <span
          v-for="n in 3"
          :key="n"
          class="mx-3 my-2 h-5 w-28 animate-pulse rounded-sm bg-white/10"
        />
      </template>

      <NuxtLink
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        class="flex h-11 items-center rounded-md px-3 text-nav font-medium transition-colors"
        active-class="bg-sidebar-active text-white"
        exact-active-class="bg-sidebar-active text-white"
        :class="$route.path === item.to ? '' : 'text-sidebar-muted hover:bg-white/[0.04]'"
      >
        <!-- Reserve the 20px an icon would occupy, per DESIGN.md 5.1. -->
        <span class="w-0 shrink-0" aria-hidden="true" />
        {{ item.label }}
      </NuxtLink>
    </nav>
  </aside>
</template>
