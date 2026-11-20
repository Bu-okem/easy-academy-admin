import { api } from '~~/convex/_generated/api'

/**
 * Hands Clerk's token to the Convex client.
 *
 * This has to be done by hand. `convex-vue@0.1.5` declares a `ConvexAuthOptions`
 * type but implements nothing for it - there is no auth call anywhere in its
 * runtime bundle - so without this plugin no token ever reaches Convex, every
 * request arrives unauthenticated, and every guarded function refuses.
 *
 * The token comes from a Clerk JWT template named `convex`, whose issuer must
 * match CLERK_JWT_ISSUER_DOMAIN on the Convex deployment. Until Clerk is
 * provisioned, `getToken` yields nothing and the client stays unauthenticated,
 * which is the same state as having no plugin at all.
 */
export default defineNuxtPlugin(() => {
  const convex = useConvexClient()

  let auth: ReturnType<typeof useAuth> | null = null
  try {
    auth = useAuth()
  } catch {
    // Clerk is not installed or not configured; leave the client anonymous
    // rather than taking the application down over it.
    return
  }
  if (!auth) return

  let linked = false

  function waitUntilLoaded(): Promise<void> {
    if (auth?.isLoaded.value) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        stop()
        resolve()
      }, 5000)
      const stop = watch(
        () => auth?.isLoaded.value,
        (loaded) => {
          if (!loaded) return
          clearTimeout(timer)
          stop()
          resolve()
        },
        { immediate: true }
      )
    })
  }

  watchEffect(() => {
    const loaded = auth?.isLoaded.value
    const signedIn = auth?.isSignedIn.value

    if (loaded && !signedIn) {
      linked = false
      convex.setAuth(async () => null)
      return
    }

    convex.setAuth(async ({ forceRefreshToken }) => {
      await waitUntilLoaded()
      if (!auth?.isSignedIn.value) return null
      try {
        return (
          (await auth.getToken.value?.({
            template: 'convex',
            skipCache: forceRefreshToken,
          })) ?? null
        )
      } catch {
        // A token that cannot be fetched is the same as no token: the request
        // goes out unauthenticated and the server refuses it, which is correct.
        return null
      }
    })

    if (loaded && signedIn && !linked) {
      linked = true
      convex.mutation(api.calendar.linkSession, {}).catch(() => {})
    }
  })
})
