/**
 * Handles **client-side navigation** between pages.
 *
 * Nuxt runs global middleware on the server for a document request and on the
 * client only for subsequent navigations - it is not re-run during hydration.
 * So this cannot catch a hard load, and `server/middleware/auth.ts` does that
 * half. Both are needed; neither is the security boundary, because every Convex
 * function checks a capability regardless.
 *
 * `NUXT_PUBLIC_ALLOW_UNAUTHENTICATED=true` turns both off for local work before
 * Clerk is provisioned, mirroring DEV_UNAUTHENTICATED_ROLE on the Convex side.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path.startsWith('/sign-in')) return

  // Nuxt parses env values, so NUXT_PUBLIC_ALLOW_UNAUTHENTICATED=true arrives as
  // the boolean true rather than the string. Compare on the stringified value so
  // either form works.
  const { public: config } = useRuntimeConfig()
  if (String(config.allowUnauthenticated) === 'true') return

  let auth: ReturnType<typeof useAuth>
  try {
    auth = useAuth()
  } catch {
    // Clerk is unavailable; the server is still enforcing, so send them to the
    // sign-in screen rather than silently granting access.
    return navigateTo('/sign-in')
  }

  // Clerk cannot answer during server rendering, so the page renders and this
  // runs again on the client.
  if (import.meta.server) return

  // On the client it must *wait*. Middleware runs during hydration, which is
  // before Clerk has loaded, and it is not re-evaluated afterwards - so reading
  // isLoaded and returning early let every hard load straight through.
  if (!auth.isLoaded.value) {
    await new Promise<void>((resolve) => {
      const give_up = setTimeout(() => {
        stop()
        resolve()
      }, 5000)
      const stop = watch(
        auth.isLoaded,
        (loaded) => {
          if (!loaded) return
          clearTimeout(give_up)
          stop()
          resolve()
        },
        { immediate: true }
      )
    })
  }

  // Still unknown after waiting: Clerk is not answering, and the server refuses
  // anyway, so sending them to sign in is the honest outcome.
  if (!auth.isLoaded.value) {
    return navigateTo('/sign-in')
  }

  if (!auth.isSignedIn.value) {
    return navigateTo(`/sign-in?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
