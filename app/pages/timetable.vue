<script setup lang="ts">
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'

type Day = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'

const weekdayList: Day[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const includeSaturday = useState('timetable-include-saturday', () => false)

const selectedSection = ref<string>('')
const { can } = useViewer()

const { data: sections } = useConvexQuery(api.timetable.sections)
const { data: grid, isPending } = useConvexQuery(
  api.timetable.grid,
  computed(() => ({
    classSectionId: selectedSection.value === ''
      ? undefined
      : (selectedSection.value as Id<'classSections'>),
  }))
)

const sectionOptions = computed(() =>
  (sections.value ?? []).map((section) => ({ value: section.id, label: section.name }))
)

// The query falls back to the first section; reflect that back into the picker
// so the control never disagrees with the grid beneath it.
watch(grid, (value) => {
  if (value && selectedSection.value === '') selectedSection.value = value.section.id
  if (value?.slots.some((slot) => slot.dayOfWeek === 'Saturday')) {
    includeSaturday.value = true
  }
})

const days = computed<Day[]>(() =>
  includeSaturday.value ? [...weekdayList, 'Saturday'] : weekdayList
)

/** What sits in one cell, if anything. */
const slotAt = (day: Day, periodId: string) =>
  grid.value?.slots.find((slot) => slot.dayOfWeek === day && slot.periodId === periodId) ?? null

useHead({ title: 'Timetable' })

// --- Placing and removing ---------------------------------------------------
const bellScheduleDialog = ref(false)
const dialogOpen = ref(false)
const target = ref<{ day: Day; periodId: string; periodName: string } | null>(null)
const occupied = ref<ReturnType<typeof slotAt>>(null)

function openCell(day: Day, period: { id: string; name: string; isBreak: boolean }) {
  if (period.isBreak || !can('timetable.manage')) return
  target.value = { day, periodId: period.id, periodName: period.name }
  occupied.value = slotAt(day, period.id)
  dialogOpen.value = true
}
</script>

<template>
  <div>
    <PageHeader
      title="Timetable"
      :caption="grid ? `${grid.section.name} · ${grid.term.name}` : 'The master schedule for the active term'"
    />

    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div class="w-full max-w-xs">
        <AppSelect
          v-model="selectedSection"
          label="Class section"
          placeholder="Choose a class"
          :options="sectionOptions"
        />
      </div>

      <div class="flex flex-wrap items-center gap-4">
        <label class="flex items-center gap-2 text-body text-ink">
          <input
            v-model="includeSaturday"
            type="checkbox"
            class="h-4 w-4 rounded border-hairline accent-brass"
          >
          <span>Include Saturday</span>
        </label>

        <button
          v-if="can('academics.manage')"
          type="button"
          class="rounded-sm border border-hairline bg-surface px-3.5 py-2 text-caption font-medium text-ink transition hover:bg-page"
          @click="bellScheduleDialog = true"
        >
          Customize bell schedule
        </button>
      </div>
    </div>

    <div v-if="isPending" class="h-64 animate-pulse rounded-lg bg-surface shadow-card" aria-busy="true" />

    <EmptyState
      v-else-if="!grid"
      icon="calendar"
      message="No academic year is active yet. Create one and mark it active to build a timetable."
    />

    <div v-else class="overflow-x-auto rounded-lg bg-surface shadow-card">
      <table class="w-full border-collapse text-body">
        <caption class="sr-only">{{ grid.section.name }} timetable for {{ grid.term.name }}</caption>

        <thead>
          <tr class="border-b border-hairline">
            <th scope="col" class="w-36 px-4 py-3 text-left text-caption font-semibold text-ink-secondary">
              Period
            </th>
            <th
              v-for="day in days"
              :key="day"
              scope="col"
              class="px-3 py-3 text-left text-caption font-semibold text-ink-secondary"
            >{{ day }}</th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="period in grid.periods"
            :key="period.id"
            class="border-b border-hairline last:border-b-0"
          >
            <th scope="row" class="px-4 py-2 text-left align-top">
              <span class="block text-body font-medium text-ink">{{ period.name }}</span>
              <span class="block text-caption text-ink-secondary">
                {{ period.startTime }}–{{ period.endTime }}
              </span>
            </th>

            <!-- A break is one band across the week, not six placeable cells. -->
            <td
              v-if="period.isBreak"
              :colspan="days.length"
              class="bg-page px-4 py-2 text-caption text-ink-secondary"
            >
              {{ period.name }}
            </td>

            <td v-for="day in days" v-else :key="day" class="p-1 align-top">
              <button
                type="button"
                :disabled="!can('timetable.manage')"
                class="flex h-full min-h-[56px] w-full flex-col justify-center rounded-sm px-2 py-1.5 text-left transition-colors disabled:cursor-default"
                :class="
                  slotAt(day, period.id)
                    ? can('timetable.manage')
                      ? 'bg-brass-tint/60 hover:bg-brass-tint'
                      : 'bg-brass-tint/60'
                    : can('timetable.manage')
                      ? 'text-ink-disabled hover:bg-page'
                      : 'text-ink-disabled'
                "
                @click="openCell(day, period)"
              >
                <template v-if="slotAt(day, period.id)">
                  <span class="text-body font-medium text-ink">
                    {{ slotAt(day, period.id)!.subject }}
                  </span>
                  <span class="text-caption text-ink-secondary">
                    {{ slotAt(day, period.id)!.teacher }}
                  </span>
                  <span class="text-caption text-ink-secondary">
                    {{ slotAt(day, period.id)!.classroom }}
                  </span>
                </template>
                <span v-else-if="can('timetable.manage')" class="text-caption">+</span>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <TimetablePlaceLessonDialog
      v-if="can('timetable.manage')"
      v-model:open="dialogOpen"
      :target="target"
      :occupied="occupied"
      :class-section-id="grid?.section.id ?? null"
    />

    <AcademicsBellScheduleDialog
      v-if="can('academics.manage')"
      v-model:open="bellScheduleDialog"
    />
  </div>
</template>
