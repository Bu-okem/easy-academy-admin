<script setup lang="ts">
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'

const selectedStudentId = ref<string>('')

const { data: portal, isPending, error } = useConvexQuery(
  api.portal.overview,
  computed(() => ({
    studentId:
      selectedStudentId.value === ''
        ? undefined
        : (selectedStudentId.value as Id<'students'>),
  }))
)

watch(portal, (value) => {
  if (value?.selectedStudent && selectedStudentId.value === '') {
    selectedStudentId.value = value.selectedStudent.id
  }
})

const student = computed(() => portal.value?.selectedStudent ?? null)

const kpis = computed(() => {
  const s = student.value
  if (!s) return []
  return [
    {
      label: 'Attendance This Term',
      value: s.attendance.rate === null ? '—' : `${s.attendance.rate}%`,
      icon: 'checkCircle',
      comparison: `${s.attendance.counts.present} present · ${s.attendance.counts.absent} absent`,
    },
    {
      label: 'Term GPA',
      value: s.reportCard?.termGpa != null ? String(s.reportCard.termGpa) : '—',
      icon: 'award',
      comparison: s.reportCard ? 'Published report card' : 'Pending release',
    },
    {
      label: 'Behaviour',
      value: `${s.behavior.counts.merits} / ${s.behavior.counts.demerits}`,
      icon: 'clipboard',
      comparison: 'Merits / demerits',
    },
  ]
})

const headerCaption = computed(() => {
  const p = portal.value
  const s = student.value
  const parts: string[] = []
  if (s?.gradeName && s.sectionName) parts.push(`${s.gradeName} · ${s.sectionName}`)
  else if (s?.sectionName) parts.push(s.sectionName)
  if (p?.academicYear) parts.push(p.academicYear)
  if (p?.termName) parts.push(p.termName)
  return parts.join(' · ') || 'Family & student portal'
})
</script>

<template>
  <div>
    <div v-if="error" class="rounded-lg bg-surface p-6 shadow-card">
      <p class="text-body text-negative-text">
        The portal could not be loaded. {{ error.message }}
      </p>
    </div>

    <div v-else-if="isPending" class="flex flex-col gap-6" aria-busy="true">
      <div class="h-24 animate-pulse rounded-lg bg-surface shadow-card" />
      <div class="grid grid-cols-12 gap-6">
        <div
          v-for="n in 3"
          :key="n"
          class="col-span-12 h-[132px] animate-pulse rounded-lg bg-surface shadow-card md:col-span-6 xl:col-span-4"
        />
      </div>
    </div>

    <EmptyState
      v-else-if="!portal || !student"
      icon="users"
      message="No student profile is linked to this account yet. Ask the school office to link your record."
    />

    <div v-else class="flex flex-col gap-6">
      <!-- Child switcher when a parent is linked to multiple students -->
      <div
        v-if="portal.students.length > 1"
        class="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Select child"
      >
        <button
          v-for="child in portal.students"
          :key="child.id"
          type="button"
          class="rounded-full px-4 py-1.5 text-body font-medium transition-colors"
          :class="
            child.id === student.id
              ? 'bg-brass text-white'
              : 'border border-hairline bg-surface text-ink hover:bg-page'
          "
          :aria-pressed="child.id === student.id"
          @click="selectedStudentId = child.id"
        >
          {{ child.fullName }}
          <span v-if="child.sectionName" class="ml-1 opacity-80">· {{ child.sectionName }}</span>
        </button>
      </div>

      <!-- Student header (DESIGN.md 5.14: 48px avatar) -->
      <div class="flex flex-wrap items-center gap-4 rounded-lg bg-surface p-6 shadow-card">
        <AppAvatar :name="student.fullName" :size="48" />
        <div class="min-w-0 flex-1">
          <h1 class="font-display text-greeting font-medium text-ink">{{ student.fullName }}</h1>
          <p class="mt-0.5 text-caption text-ink-secondary">
            {{ headerCaption }} · Born {{ formatDayMonthYear(student.dateOfBirth) ?? student.dateOfBirth }}
          </p>
        </div>
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-12 gap-6">
        <KpiCard
          v-for="kpi in kpis"
          :key="kpi.label"
          v-bind="kpi"
          class="col-span-12 md:col-span-6 xl:col-span-4"
        />
      </div>

      <!-- Published Report Card -->
      <section class="rounded-lg bg-surface p-6 shadow-card">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="font-display text-section font-medium text-ink">
              Report Card{{ portal.termName ? ` · ${portal.termName}` : '' }}
            </h2>
            <p class="mt-0.5 text-caption text-ink-secondary">
              Official term grades and remarks from the school
            </p>
          </div>
          <StatusBadge :status="student.reportCard ? 'published' : 'pending'" />
        </div>

        <p v-if="!student.reportCard" class="text-body text-ink-secondary">
          This term's report card has not been published yet. It will appear here once the school releases it.
        </p>

        <div v-else class="flex flex-col gap-5">
          <ul v-if="student.reportCard.subjects.length > 0" class="divide-y divide-hairline rounded-sm border border-hairline">
            <li
              v-for="subject in student.reportCard.subjects"
              :key="subject.id"
              class="flex flex-col gap-1 px-4 py-3"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span class="text-body font-medium text-ink">{{ subject.subjectName }}</span>
                  <span class="ml-2 text-caption text-ink-secondary">
                    {{ subject.subjectCode }} · {{ subject.teacherName }}
                  </span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-body text-ink">{{ subject.cumulativeScore }}%</span>
                  <span class="inline-flex min-w-[28px] justify-center rounded-full bg-brass-tint px-2 py-0.5 text-badge font-semibold text-brass-dark">
                    {{ subject.letterGrade }}
                  </span>
                </div>
              </div>
              <p v-if="subject.teacherRemark" class="text-caption text-ink-secondary">
                {{ subject.teacherRemark }}
              </p>
            </li>
          </ul>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="rounded-sm bg-page p-4">
              <p class="text-caption font-medium text-ink-secondary">Form teacher remark</p>
              <p class="mt-1 text-body text-ink">
                {{ student.reportCard.formTeacherRemark ?? '—' }}
              </p>
            </div>
            <div class="rounded-sm bg-page p-4">
              <p class="text-caption font-medium text-ink-secondary">Principal remark</p>
              <p class="mt-1 text-body text-ink">
                {{ student.reportCard.principalRemark ?? '—' }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Timetable + Attendance & Behaviour -->
      <div class="grid grid-cols-12 gap-6">
        <section class="col-span-12 rounded-lg bg-surface p-6 shadow-card xl:col-span-6">
          <h2 class="mb-4 font-display text-section font-medium text-ink">Class timetable</h2>

          <p v-if="student.timetable.length === 0" class="text-body text-ink-secondary">
            No lessons have been scheduled for this class yet.
          </p>

          <ul v-else class="divide-y divide-hairline">
            <li
              v-for="slot in student.timetable"
              :key="slot.id"
              class="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
            >
              <div>
                <p class="text-body font-medium text-ink">
                  {{ slot.dayOfWeek }} · {{ slot.periodName }}
                  <span class="text-caption font-normal text-ink-secondary">
                    ({{ slot.startTime }}–{{ slot.endTime }})
                  </span>
                </p>
                <p class="text-caption text-ink-secondary">
                  {{ slot.subjectName }} · {{ slot.teacherName }}
                </p>
              </div>
              <span class="text-caption font-medium text-ink-secondary">{{ slot.classroomName }}</span>
            </li>
          </ul>
        </section>

        <section class="col-span-12 flex flex-col gap-6 rounded-lg bg-surface p-6 shadow-card xl:col-span-6">
          <div>
            <h2 class="mb-3 font-display text-section font-medium text-ink">Recent attendance</h2>
            <p v-if="student.attendance.recent.length === 0" class="text-body text-ink-secondary">
              No attendance entries recorded this term.
            </p>
            <ul v-else class="divide-y divide-hairline">
              <li
                v-for="entry in student.attendance.recent"
                :key="entry.id"
                class="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <span class="text-body text-ink">
                  {{ formatDayMonthYear(entry.attendanceDate) ?? entry.attendanceDate }}
                  <span v-if="entry.remarks" class="ml-1.5 text-caption text-ink-secondary">
                    · {{ entry.remarks }}
                  </span>
                </span>
                <StatusBadge :status="entry.status" />
              </li>
            </ul>
          </div>

          <div class="border-t border-hairline pt-5">
            <h2 class="mb-3 font-display text-section font-medium text-ink">Behaviour log</h2>
            <p v-if="student.behavior.items.length === 0" class="text-body text-ink-secondary">
              No merits or demerits recorded this term.
            </p>
            <ul v-else class="divide-y divide-hairline">
              <li
                v-for="item in student.behavior.items"
                :key="item.id"
                class="flex flex-col gap-1 py-3 first:pt-0 last:pb-0"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="flex items-center gap-2">
                    <StatusBadge :status="item.type" />
                    <span class="text-caption text-ink-secondary">
                      Severity {{ item.severityLevel }}/5
                    </span>
                  </span>
                  <span class="text-caption text-ink-secondary">
                    {{ formatDayMonthYear(item.incidentDate) ?? item.incidentDate }} ·
                    {{ item.teacherName }}
                  </span>
                </div>
                <p class="text-body text-ink">{{ item.description }}</p>
                <p v-if="item.actionTaken" class="text-caption text-ink-secondary">
                  Action taken: {{ item.actionTaken }}
                </p>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
