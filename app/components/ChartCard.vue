<script setup lang="ts">
// DESIGN.md 5.10 - KPI card shell, title left, current value in Fraunces
// top-right, brass line with a soft area fill.
//
// Colour: the fill is brass at 12% as specified. The stroke is brass-dark,
// because brass on white measures 2.82:1 - below the 3:1 a data mark needs. The
// design system already darkens strokes this way for icons (section 4).
// Alongside that, the endpoint is labelled and a table of the same numbers is
// available to screen readers, which is the relief a low-contrast mark requires.
const props = withDefaults(
  defineProps<{
    title: string
    points: ReadonlyArray<{ date: string; label: string; rate: number }>
    /** Shown top-right, e.g. "94.2%". */
    value?: string | null
    loading?: boolean
  }>(),
  { value: null }
)

// viewBox units; the SVG scales to its container.
const W = 600
const H = 200
const PAD = { top: 12, right: 12, bottom: 26, left: 34 }
const plot = {
  left: PAD.left,
  right: W - PAD.right,
  top: PAD.top,
  bottom: H - PAD.bottom,
}

/** A percentage belongs on a 0-100 axis: the area fill reads from zero. */
const ticks = [0, 25, 50, 75, 100]

const x = (index: number) => {
  const count = props.points.length
  if (count <= 1) return (plot.left + plot.right) / 2
  return plot.left + ((plot.right - plot.left) * index) / (count - 1)
}
const y = (rate: number) => plot.bottom - ((plot.bottom - plot.top) * rate) / 100

const linePath = computed(() =>
  props.points.map((point, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(point.rate)}`).join(' ')
)

const areaPath = computed(() => {
  if (props.points.length === 0) return ''
  const last = props.points.length - 1
  return `${linePath.value} L${x(last)} ${plot.bottom} L${x(0)} ${plot.bottom} Z`
})

const lastIndex = computed(() => props.points.length - 1)

/** Anchor the end labels inward so they cannot be clipped by the viewBox. */
const anchor = (index: number) =>
  index === 0 ? 'start' : index === lastIndex.value ? 'end' : 'middle'

/** Thin the x labels so they cannot collide on a narrow card. */
const showLabel = (index: number) => {
  const every = props.points.length > 8 ? 3 : props.points.length > 5 ? 2 : 1
  return index === lastIndex.value || index % every === 0
}

// --- Hover: crosshair plus tooltip, per the interaction defaults ------------
const hovered = ref<number | null>(null)
const svg = useTemplateRef<SVGSVGElement>('svg')

function onMove(event: PointerEvent) {
  const box = svg.value?.getBoundingClientRect()
  if (!box || props.points.length === 0) return

  // Map the pointer into viewBox units, then to the nearest point.
  const units = ((event.clientX - box.left) / box.width) * W
  const span = plot.right - plot.left
  const ratio = span === 0 ? 0 : (units - plot.left) / span
  const index = Math.round(ratio * (props.points.length - 1))
  hovered.value = Math.min(Math.max(index, 0), props.points.length - 1)
}

const active = computed(() =>
  hovered.value === null ? null : (props.points[hovered.value] ?? null)
)
</script>

<template>
  <div class="rounded-lg bg-surface p-6 shadow-card">
    <div class="flex items-start justify-between gap-4">
      <h2 class="text-body font-medium text-ink">{{ title }}</h2>
      <p v-if="value" class="font-display text-stat-sm font-semibold text-ink">{{ value }}</p>
    </div>

    <div v-if="loading" class="mt-4 h-[200px] animate-pulse rounded-md bg-page" aria-hidden="true" />

    <p v-else-if="points.length === 0" class="mt-4 text-body text-ink-secondary">
      No registers have been taken yet, so there is no trend to show.
    </p>

    <div v-else class="relative mt-4">
      <svg
        ref="svg"
        :viewBox="`0 0 ${W} ${H}`"
        class="h-auto w-full"
        role="img"
        :aria-label="`${title}, ${points.length} days`"
        @pointermove="onMove"
        @pointerleave="hovered = null"
      >
        <!-- Gridlines: solid and recessive; dashes read as a data series. -->
        <g>
          <line
            v-for="tick in ticks"
            :key="tick"
            :x1="plot.left"
            :x2="plot.right"
            :y1="y(tick)"
            :y2="y(tick)"
            stroke="#E6E1D6"
            stroke-width="1"
            :opacity="tick === 0 ? 0.9 : 0.5"
          />
          <text
            v-for="tick in ticks"
            :key="`label-${tick}`"
            :x="plot.left - 8"
            :y="y(tick) + 4"
            text-anchor="end"
            class="fill-ink-secondary text-[12px]"
          >{{ tick }}</text>
        </g>

        <path :d="areaPath" fill="#B8915C" fill-opacity="0.12" />
        <path
          :d="linePath"
          fill="none"
          stroke="#8C6A3D"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <!-- Endpoint only: a dot on every point is noise at this density. -->
        <circle :cx="x(lastIndex)" :cy="y(points[lastIndex]!.rate)" r="4" fill="#8C6A3D" />

        <g v-if="hovered !== null && active">
          <line
            :x1="x(hovered)"
            :x2="x(hovered)"
            :y1="plot.top"
            :y2="plot.bottom"
            stroke="#8C6A3D"
            stroke-width="1"
            opacity="0.4"
          />
          <circle :cx="x(hovered)" :cy="y(active.rate)" r="4" fill="#8C6A3D" stroke="#FFFFFF" stroke-width="2" />
        </g>

        <text
          v-for="(point, index) in points"
          v-show="showLabel(index)"
          :key="point.date"
          :x="x(index)"
          :y="H - 8"
          :text-anchor="anchor(index)"
          class="fill-ink-secondary text-[12px]"
        >{{ point.label }}</text>
      </svg>

      <!-- Tooltip, positioned along the plot rather than following the cursor. -->
      <div
        v-if="active"
        class="pointer-events-none absolute top-0 rounded-md bg-sidebar-bg px-3 py-2 text-caption text-white shadow-dropdown"
        :style="{ left: `${(x(hovered!) / W) * 100}%`, transform: 'translateX(-50%)' }"
      >
        <span class="font-medium">{{ active.label }}</span>
        <span class="ml-2">{{ active.rate }}%</span>
      </div>
    </div>

    <!-- The same numbers, for screen readers and as the relief a low-contrast
         mark requires. -->
    <table v-if="points.length > 0" class="sr-only">
      <caption>{{ title }} by day</caption>
      <thead>
        <tr><th scope="col">Day</th><th scope="col">Attendance</th></tr>
      </thead>
      <tbody>
        <tr v-for="point in points" :key="point.date">
          <th scope="row">{{ point.label }}</th>
          <td>{{ point.rate }}%</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
