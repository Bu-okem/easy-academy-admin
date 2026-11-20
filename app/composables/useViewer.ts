import { api } from '~~/convex/_generated/api'

export type ViewerRole = 'admin' | 'teacher' | 'staff' | 'parent' | 'student'

export type ViewerCapability =
  | 'portal.view'
  | 'overview.view'
  | 'people.view'
  | 'academics.manage'
  | 'timetable.view'
  | 'timetable.manage'
  | 'register.take'
  | 'marks.record'
  | 'results.view'
  | 'results.calculate'
  | 'results.publish'

const ROLE_ROUTE_CAPABILITIES: Record<ViewerRole, readonly string[]> = {
  admin: ['/', '/people', '/academics', '/timetable', '/operations', '/results'],
  teacher: ['/', '/people', '/timetable', '/operations', '/results'],
  staff: ['/', '/people', '/timetable', '/results'],
  parent: ['/'],
  student: ['/'],
}

/**
 * Current caller's role, capability helpers, and admin role-preview switcher.
 */
export function useViewer() {
  const { data: viewer, isPending } = useConvexQuery(api.calendar.viewer)
  const { mutate: switchRoleMutation } = useConvexMutation(api.calendar.switchViewerRole)
  const route = useRoute()
  const switching = useState('viewer-switching', () => false)

  const role = computed<ViewerRole | null>(() => viewer.value?.role ?? null)
  const capabilitySet = computed(() => new Set<string>(viewer.value?.capabilities ?? []))
  const isPortalRole = computed(() => role.value === 'parent' || role.value === 'student')
  const canSwitchRole = computed(() => viewer.value?.canSwitchRole ?? false)

  function can(capability: ViewerCapability): boolean {
    if (switching.value) return false
    return capabilitySet.value.has(capability)
  }

  async function switchRole(targetRole: ViewerRole) {
    if (switching.value || targetRole === role.value) return
    switching.value = true
    try {
      const allowedRoutes = ROLE_ROUTE_CAPABILITIES[targetRole]
      if (!allowedRoutes.includes(route.path)) {
        await navigateTo('/')
      }
      await nextTick()
      await switchRoleMutation({ role: targetRole })

      if (viewer.value?.role !== targetRole) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            stop()
            resolve()
          }, 2000)
          const stop = watch(
            () => viewer.value?.role,
            (nextRole) => {
              if (nextRole !== targetRole) return
              clearTimeout(timer)
              stop()
              resolve()
            },
            { immediate: true }
          )
        })
      }
    } finally {
      switching.value = false
    }
  }

  return {
    viewer,
    role,
    isPending,
    isSwitching: switching,
    can,
    isPortalRole,
    canSwitchRole,
    switchRole,
  }
}
