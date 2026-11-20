<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

type ScheduleMode = 'timed-breaks' | 'after-lesson'

interface AfterLessonBreakRow {
  afterLesson: number
  name: string
  durationMinutes: number
}

interface TimedBreakRow {
  name: string
  startTime: string
  durationMinutes: number
}

const open = defineModel<boolean>('open', { required: true })

const { mutate: generateSchedule, isPending: savingByLesson } = useConvexMutation(
  api.academics.generateBellSchedule
)
const { mutate: generateTimedSchedule, isPending: savingByTime } = useConvexMutation(
  api.academics.generateBellScheduleByBreakTimes
)

const isPending = computed(() => savingByLesson.value || savingByTime.value)
const mode = ref<ScheduleMode>('timed-breaks')

const startTime = ref('08:00')
const lessonCount = ref(6)
const lessonDurationMinutes = ref(40)
const passingMinutes = ref(0)

const timedBreaks = ref<TimedBreakRow[]>([
  { name: 'Morning Break', startTime: '09:20', durationMinutes: 20 },
  { name: 'Lunch Break', startTime: '11:00', durationMinutes: 40 },
])

const afterLessonBreaks = ref<AfterLessonBreakRow[]>([
  { afterLesson: 2, name: 'Morning Break', durationMinutes: 20 },
])

const problem = ref<string | null>(null)
const needsClearConfirmation = ref(false)

watch(open, (isOpen) => {
  if (isOpen) {
    problem.value = null
    needsClearConfirmation.value = false
  }
})

function switchMode(next: ScheduleMode) {
  mode.value = next
  problem.value = null
  needsClearConfirmation.value = false
}

const timedBreakCount = computed({
  get: () => timedBreaks.value.length,
  set(nextCount: number) {
    const clamped = Math.max(0, Math.min(6, Math.floor(Number(nextCount) || 0)))
    while (timedBreaks.value.length < clamped) {
      const idx = timedBreaks.value.length
      timedBreaks.value.push({
        name: idx === 0 ? 'Morning Break' : idx === 1 ? 'Lunch Break' : `Break ${idx + 1}`,
        startTime: idx === 0 ? '09:20' : idx === 1 ? '11:00' : '13:00',
        durationMinutes: idx === 1 ? 40 : 20,
      })
    }
    if (timedBreaks.value.length > clamped) {
      timedBreaks.value.splice(clamped)
    }
    needsClearConfirmation.value = false
  },
})

function addAfterLessonBreak() {
  const maxAfter = Math.max(1, lessonCount.value - 1)
  const used = new Set(afterLessonBreaks.value.map((b) => b.afterLesson))
  let nextLesson = 1
  while (used.has(nextLesson) && nextLesson < maxAfter) nextLesson++
  afterLessonBreaks.value.push({
    afterLesson: Math.min(nextLesson, maxAfter),
    name: afterLessonBreaks.value.length === 0 ? 'Morning Break' : 'Lunch Break',
    durationMinutes: afterLessonBreaks.value.length === 0 ? 20 : 40,
  })
  needsClearConfirmation.value = false
}

function removeAfterLessonBreak(index: number) {
  afterLessonBreaks.value.splice(index, 1)
  needsClearConfirmation.value = false
}

function parseClock(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim())
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function toClock(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const preview = computed(() => {
  const dayStart = parseClock(startTime.value)
  if (dayStart === null) return []
  const count = Math.max(1, Math.min(12, Math.floor(Number(lessonCount.value) || 0)))
  const duration = Math.max(15, Math.min(180, Math.floor(Number(lessonDurationMinutes.value) || 0)))
  const passing = Math.max(0, Math.min(30, Math.floor(Number(passingMinutes.value) || 0)))

  const items: Array<{ name: string; startTime: string; endTime: string; isBreak: boolean }> = []

  if (mode.value === 'timed-breaks') {
    const parsedBreaks: Array<{ name: string; start: number; end: number }> = []
    for (const row of timedBreaks.value) {
      const start = parseClock(row.startTime)
      if (start === null || start < dayStart) return []
      const brkDur = Math.max(5, Math.min(120, Math.floor(Number(row.durationMinutes) || 0)))
      const end = start + brkDur
      if (end >= 24 * 60) return []
      parsedBreaks.push({ name: row.name.trim() || 'Break', start, end })
    }
    parsedBreaks.sort((a, b) => a.start - b.start)
    for (let i = 1; i < parsedBreaks.length; i++) {
      if (parsedBreaks[i]!.start < parsedBreaks[i - 1]!.end) return []
    }

    let cursor = dayStart
    let breakIdx = 0
    for (let lesson = 1; lesson <= count; lesson++) {
      while (breakIdx < parsedBreaks.length) {
        const nextBreak = parsedBreaks[breakIdx]!
        if (cursor + duration <= nextBreak.start) break
        items.push({
          name: nextBreak.name,
          startTime: toClock(nextBreak.start),
          endTime: toClock(nextBreak.end),
          isBreak: true,
        })
        cursor = Math.max(cursor, nextBreak.end)
        breakIdx++
      }

      const lessonEnd = cursor + duration
      if (lessonEnd >= 24 * 60) break
      items.push({
        name: `Period ${lesson}`,
        startTime: toClock(cursor),
        endTime: toClock(lessonEnd),
        isBreak: false,
      })
      cursor = lessonEnd
      if (lesson < count) cursor += passing
    }
    return items
  }

  const breakMap = new Map<number, AfterLessonBreakRow>()
  for (const row of afterLessonBreaks.value) {
    if (!breakMap.has(row.afterLesson)) breakMap.set(row.afterLesson, row)
  }

  let cursor = dayStart
  for (let lesson = 1; lesson <= count; lesson++) {
    const lessonEnd = cursor + duration
    if (lessonEnd >= 24 * 60) break
    items.push({
      name: `Period ${lesson}`,
      startTime: toClock(cursor),
      endTime: toClock(lessonEnd),
      isBreak: false,
    })
    cursor = lessonEnd

    const brk = breakMap.get(lesson)
    if (brk && lesson < count) {
      const brkDur = Math.max(5, Math.min(120, Math.floor(Number(brk.durationMinutes) || 0)))
      const brkEnd = cursor + brkDur
      if (brkEnd >= 24 * 60) break
      items.push({
        name: brk.name.trim() || 'Break',
        startTime: toClock(cursor),
        endTime: toClock(brkEnd),
        isBreak: true,
      })
      cursor = brkEnd
    } else if (lesson < count) {
      cursor += passing
    }
  }

  return items
})

async function submit(clearExistingSlots = false) {
  problem.value = null
  try {
    if (mode.value === 'timed-breaks') {
      await generateTimedSchedule({
        startTime: startTime.value.trim(),
        lessonCount: Number(lessonCount.value),
        lessonDurationMinutes: Number(lessonDurationMinutes.value),
        passingMinutes: Number(passingMinutes.value) || 0,
        breaks: timedBreaks.value.map((b) => ({
          name: b.name,
          startTime: b.startTime.trim(),
          durationMinutes: Number(b.durationMinutes),
        })),
        clearExistingSlots,
      })
    } else {
      await generateSchedule({
        startTime: startTime.value.trim(),
        lessonCount: Number(lessonCount.value),
        lessonDurationMinutes: Number(lessonDurationMinutes.value),
        passingMinutes: Number(passingMinutes.value) || 0,
        breaks: afterLessonBreaks.value.map((b) => ({
          afterLesson: Number(b.afterLesson),
          name: b.name,
          durationMinutes: Number(b.durationMinutes),
        })),
        clearExistingSlots,
      })
    }
    open.value = false
  } catch (error) {
    const data = (error as { data?: { code?: string; message?: string } })?.data
    if (data?.code === 'scheduleInUse') {
      needsClearConfirmation.value = true
      problem.value = data.message ?? 'Existing lessons use the current periods.'
      return
    }
    needsClearConfirmation.value = false
    problem.value = data?.message ?? 'Could not generate bell schedule.'
  }
}
</script>

<template>
  <AppModal v-model:open="open" title="Customize bell schedule" wide>
    <div
      role="tablist"
      aria-label="Schedule builder mode"
      class="mb-5 grid grid-cols-2 gap-1 rounded-sm bg-page p-1"
    >
      <button
        type="button"
        role="tab"
        :aria-selected="mode === 'timed-breaks'"
        class="rounded-sm px-3 py-2 text-caption font-semibold transition"
        :class="
          mode === 'timed-breaks'
            ? 'bg-surface text-ink shadow-sm'
            : 'text-ink-secondary hover:text-ink'
        "
        @click="switchMode('timed-breaks')"
      >
        By break start time
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="mode === 'after-lesson'"
        class="rounded-sm px-3 py-2 text-caption font-semibold transition"
        :class="
          mode === 'after-lesson'
            ? 'bg-surface text-ink shadow-sm'
            : 'text-ink-secondary hover:text-ink'
        "
        @click="switchMode('after-lesson')"
      >
        After lesson #
      </button>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <form class="flex flex-col gap-4" @submit.prevent="submit(false)">
        <div class="grid grid-cols-2 gap-3">
          <AppInput v-model="startTime" label="Day start time" placeholder="08:00" />
          <div>
            <label class="mb-1.5 block text-caption font-medium text-ink-secondary">
              Number of classes
            </label>
            <input
              v-model.number="lessonCount"
              type="number"
              min="1"
              max="12"
              class="w-full rounded-sm border border-hairline bg-surface px-3 py-2 text-body text-ink focus:border-brass focus:outline-none"
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="mb-1.5 block text-caption font-medium text-ink-secondary">
              Class duration (min)
            </label>
            <input
              v-model.number="lessonDurationMinutes"
              type="number"
              min="15"
              max="180"
              class="w-full rounded-sm border border-hairline bg-surface px-3 py-2 text-body text-ink focus:border-brass focus:outline-none"
            />
          </div>
          <div>
            <label class="mb-1.5 block text-caption font-medium text-ink-secondary">
              Gap between classes (min)
            </label>
            <input
              v-model.number="passingMinutes"
              type="number"
              min="0"
              max="30"
              class="w-full rounded-sm border border-hairline bg-surface px-3 py-2 text-body text-ink focus:border-brass focus:outline-none"
            />
          </div>
        </div>

        <!-- Mode 1: By break start time -->
        <div v-if="mode === 'timed-breaks'" class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-3">
            <label
              for="timed-break-count"
              class="text-caption font-medium text-ink-secondary"
            >
              Number of break periods
            </label>
            <input
              id="timed-break-count"
              v-model.number="timedBreakCount"
              type="number"
              min="0"
              max="6"
              class="w-20 rounded-sm border border-hairline bg-surface px-2.5 py-1.5 text-body text-ink focus:border-brass focus:outline-none"
            />
          </div>

          <p v-if="timedBreaks.length === 0" class="text-caption text-ink-secondary">
            No break periods configured.
          </p>

          <div v-else class="flex flex-col gap-2">
            <div
              v-for="(row, index) in timedBreaks"
              :key="index"
              class="grid grid-cols-12 items-end gap-2 rounded-sm border border-hairline p-2.5"
            >
              <div class="col-span-5">
                <label class="block text-badge font-semibold uppercase tracking-wide text-ink-secondary">
                  Break name
                </label>
                <input
                  v-model="row.name"
                  type="text"
                  placeholder="Break"
                  class="mt-1 w-full rounded-sm border border-hairline bg-surface px-2 py-1 text-caption text-ink focus:border-brass focus:outline-none"
                />
              </div>
              <div class="col-span-4">
                <label class="block text-badge font-semibold uppercase tracking-wide text-ink-secondary">
                  Start time
                </label>
                <input
                  v-model="row.startTime"
                  type="text"
                  placeholder="10:00"
                  class="mt-1 w-full rounded-sm border border-hairline bg-surface px-2 py-1 text-caption text-ink focus:border-brass focus:outline-none"
                />
              </div>
              <div class="col-span-3">
                <label class="block text-badge font-semibold uppercase tracking-wide text-ink-secondary">
                  Mins
                </label>
                <input
                  v-model.number="row.durationMinutes"
                  type="number"
                  min="5"
                  max="120"
                  class="mt-1 w-full rounded-sm border border-hairline bg-surface px-2 py-1 text-caption text-ink focus:border-brass focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Mode 2: After lesson # -->
        <div v-else>
          <div class="mb-2 flex items-center justify-between gap-2">
            <span class="text-caption font-medium text-ink-secondary">Breaks</span>
            <button
              type="button"
              class="text-caption font-medium text-brass hover:underline"
              :disabled="lessonCount < 2"
              @click="addAfterLessonBreak"
            >
              + Add break
            </button>
          </div>

          <p v-if="afterLessonBreaks.length === 0" class="text-caption text-ink-secondary">
            No breaks added.
          </p>

          <div v-else class="flex flex-col gap-2">
            <div
              v-for="(row, index) in afterLessonBreaks"
              :key="index"
              class="grid grid-cols-12 items-end gap-2 rounded-sm border border-hairline p-2.5"
            >
              <div class="col-span-5">
                <label class="block text-badge font-semibold uppercase tracking-wide text-ink-secondary">
                  Name
                </label>
                <input
                  v-model="row.name"
                  type="text"
                  placeholder="Break"
                  class="mt-1 w-full rounded-sm border border-hairline bg-surface px-2 py-1 text-caption text-ink focus:border-brass focus:outline-none"
                />
              </div>
              <div class="col-span-3">
                <label class="block text-badge font-semibold uppercase tracking-wide text-ink-secondary">
                  After P#
                </label>
                <input
                  v-model.number="row.afterLesson"
                  type="number"
                  min="1"
                  :max="Math.max(1, lessonCount - 1)"
                  class="mt-1 w-full rounded-sm border border-hairline bg-surface px-2 py-1 text-caption text-ink focus:border-brass focus:outline-none"
                />
              </div>
              <div class="col-span-3">
                <label class="block text-badge font-semibold uppercase tracking-wide text-ink-secondary">
                  Mins
                </label>
                <input
                  v-model.number="row.durationMinutes"
                  type="number"
                  min="5"
                  max="120"
                  class="mt-1 w-full rounded-sm border border-hairline bg-surface px-2 py-1 text-caption text-ink focus:border-brass focus:outline-none"
                />
              </div>
              <div class="col-span-1 text-right">
                <button
                  type="button"
                  aria-label="Remove break"
                  class="rounded px-1.5 py-1 text-caption text-ink-secondary hover:bg-page hover:text-ink"
                  @click="removeAfterLessonBreak(index)"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        </div>

        <p
          v-if="problem"
          class="rounded-sm bg-negative-bg px-3 py-2 text-caption text-negative-text"
        >
          {{ problem }}
        </p>
      </form>

      <div class="rounded-sm border border-hairline bg-page p-4">
        <p class="mb-3 text-badge font-semibold uppercase tracking-wide text-ink-secondary">
          Day preview ({{ preview.length }} periods)
        </p>
        <p v-if="preview.length === 0" class="text-caption text-ink-secondary">
          Enter valid 24-hour times (HH:MM) without overlapping breaks to preview the schedule.
        </p>
        <ul v-else class="divide-y divide-hairline rounded-sm border border-hairline bg-surface">
          <li
            v-for="item in preview"
            :key="`${item.name}-${item.startTime}`"
            class="flex items-center justify-between px-3 py-2 text-caption"
            :class="item.isBreak ? 'bg-page text-ink-secondary' : 'text-ink'"
          >
            <span class="font-medium">{{ item.name }}</span>
            <span class="tabular-nums">{{ item.startTime }}–{{ item.endTime }}</span>
          </li>
        </ul>
      </div>
    </div>

    <template #footer>
      <AppButton variant="secondary" @click="open = false">Cancel</AppButton>
      <AppButton
        v-if="needsClearConfirmation"
        :disabled="isPending"
        @click="submit(true)"
      >
        {{ isPending ? 'Rebuilding…' : 'Clear lessons & rebuild' }}
      </AppButton>
      <AppButton
        v-else
        :disabled="isPending || preview.length === 0"
        @click="submit(false)"
      >
        {{ isPending ? 'Saving…' : 'Apply schedule' }}
      </AppButton>
    </template>
  </AppModal>
</template>
