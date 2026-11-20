<script setup lang="ts">
import type { ViewerCapability } from '~/composables/useViewer'

const routeCapabilities: Record<string, ViewerCapability> = {
  '/people': 'people.view',
  '/academics': 'academics.manage',
  '/timetable': 'timetable.view',
  '/operations': 'register.take',
  '/results': 'results.view',
}

const route = useRoute()
const { can, isPending, isSwitching } = useViewer()

const requiredCapability = computed<ViewerCapability | null>(() => {
  return routeCapabilities[route.path] ?? null
})

const isCheckingRouteAccess = computed(() => {
  return (isPending.value || isSwitching.value) && route.path !== '/' && requiredCapability.value !== null
})

const isRouteForbidden = computed(() => {
  if (!requiredCapability.value) return false
  if (isPending.value || isSwitching.value) return false
  return !can(requiredCapability.value)
})
</script>

<template>
  <div class="flex h-screen bg-page">
    <AppSidebar />

    <div class="flex min-w-0 flex-1 flex-col">
      <AppTopBar />
      <main class="flex-1 overflow-y-auto p-8">
        <div
          v-if="isCheckingRouteAccess"
          class="space-y-4"
        >
          <div class="h-8 w-48 animate-pulse rounded bg-surface-muted" />
          <div class="h-40 animate-pulse rounded-xl bg-surface-muted" />
        </div>
        <EmptyState
          v-else-if="isRouteForbidden"
          icon="alert"
          message="Your current role does not have access to this section."
          action-label="Back to home"
          action-to="/"
        />
        <slot v-else />
      </main>
    </div>
  </div>
</template>
