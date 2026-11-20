<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

const { data, isPending, error } = useConvexQuery(api.overview.stats)
const { data: attention, isPending: attentionPending } = useConvexQuery(api.overview.attention)
const { data: trend, isPending: trendPending } = useConvexQuery(api.overview.attendanceTrend)

// Absent until the query answers, and absent again if no register was taken:
// "undefined%" is worse than showing nothing.
const attendanceValue = computed(() => {
  const rate = data.value?.attendanceToday.value
  return rate === undefined || rate === null ? null : `${rate}%`
})

/** Icons by item kind; severity picks the tint (DESIGN.md sections 4 and 5.11). */
const attentionIcons: Record<string, string> = {
  registerNotTaken: 'clipboard',
  registerIncomplete: 'clipboard',
  studentsAbsent: 'users',
}

// Greet whoever is actually signed in. Before Clerk is configured there is no
// name to use, and greeting a hardcoded person while the top bar shows nobody is
// signed in was simply wrong.
const signedInUser = (() => {
  try {
    return useUser().user
  } catch {
    return ref(null)
  }
})()

const greeting = computed(() => {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const name = signedInUser.value?.firstName ?? signedInUser.value?.fullName
  return name ? `Good ${part}, ${name}` : `Good ${part}`
})

// "Tuesday, 11 March · Term 1, Week 4" (DESIGN.md 5.3). The term half comes from
// the active term, so it is absent rather than invented before one is set up.
const caption = computed(() => {
  const now = new Date()
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' })
  const date = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
  const stats = data.value

  if (!stats?.term) return `${weekday}, ${date}`
  const week = stats.weekOfTerm === null ? '' : `, Week ${stats.weekOfTerm}`
  return `${weekday}, ${date} · ${stats.term}${week}`
})

/** Percentages carry their sign as a percentage; counts are plain numbers. */
const kpis = computed(() => {
  const stats = data.value
  if (!stats) return []

  return [
    {
      label: 'Enrolled Students',
      value: stats.enrolledStudents.value.toLocaleString('en-GB'),
      icon: 'users',
      delta: stats.enrolledStudents.delta ?? undefined,
      comparison: 'vs last year',
    },
    {
      label: 'Teaching Staff',
      value: stats.teachingStaff.value.toLocaleString('en-GB'),
      icon: 'board',
      delta: stats.teachingStaff.delta ?? undefined,
      comparison: 'vs last term',
    },
    {
      label: 'Attendance Today',
      value:
        stats.attendanceToday.value === null ? '—' : `${stats.attendanceToday.value}%`,
      icon: 'checkCircle',
      delta: stats.attendanceToday.delta ?? undefined,
      deltaPercent: true,
      comparison: 'vs yesterday',
    },
  ]
})
</script>

<template>
  <div>
    <PageHeader :title="greeting" :caption="caption" />

    <div v-if="error" class="rounded-lg bg-surface p-6 shadow-card">
      <p class="text-body text-negative-text">
        The overview figures could not be loaded. {{ error.message }}
      </p>
    </div>

    <!-- Card-shaped placeholders, so the layout does not jump when data lands. -->
    <div v-else-if="isPending" class="grid grid-cols-12 gap-6" aria-busy="true">
      <div
        v-for="n in 3"
        :key="n"
        class="col-span-12 h-[132px] animate-pulse rounded-lg bg-surface shadow-card md:col-span-6 xl:col-span-4"
      />
    </div>

    <EmptyState
      v-else-if="!data"
      icon="calendar"
      message="No academic year is active yet. Create one and mark it active to see the school at a glance."
    />

    <div v-else class="grid grid-cols-12 gap-6">
      <KpiCard
        v-for="kpi in kpis"
        :key="kpi.label"
        v-bind="kpi"
        class="col-span-12 md:col-span-6 xl:col-span-4"
      />
    </div>

    <div class="mt-6 grid grid-cols-12 gap-6">
      <ChartCard
        class="col-span-12 xl:col-span-6"
        title="Attendance this fortnight"
        :points="trend ?? []"
        :loading="trendPending"
        :value="attendanceValue"
      />

      <section class="col-span-12 rounded-lg bg-surface p-6 shadow-card xl:col-span-6">
        <h2 class="font-display text-section font-medium text-ink">Needs attention</h2>

        <!-- Pending is not the same as nothing to do; saying "all clear" before the
             query answers would be untrue. -->
        <div v-if="attentionPending" class="mt-4 flex flex-col gap-4" aria-busy="true">
          <div v-for="n in 3" :key="n" class="flex items-center gap-3">
            <span class="h-8 w-8 shrink-0 animate-pulse rounded-full bg-page" />
            <span class="h-3 w-64 animate-pulse rounded-full bg-page" />
          </div>
        </div>

        <ul v-else-if="attention && attention.length > 0" class="mt-2">
          <AppListItem
            v-for="item in attention"
            :key="item.id"
            :title="item.title"
            :detail="item.detail"
            :severity="item.severity"
            :icon="attentionIcons[item.kind] ?? 'alert'"
          >
            <template #trailing>
              <NuxtLink
                :to="item.sectionId ? `/operations?section=${item.sectionId}` : '/people?tab=students'"
                class="font-medium text-brass hover:underline"
              >
                View
              </NuxtLink>
            </template>
          </AppListItem>
        </ul>

        <p v-else class="mt-3 text-body text-ink-secondary">
          Every register is taken and nobody is absent. Nothing needs attention today.
        </p>
      </section>
    </div>
  </div>
</template>
