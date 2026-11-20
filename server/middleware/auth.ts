import { clerkMiddleware, createRouteMatcher } from '@clerk/nuxt/server'
import { sendRedirect } from 'h3'

/**
 * Protects document requests.
 *
 * This is the half that catches a hard load or a pasted link: Nuxt's global
 * route middleware runs on the client only for later navigations, never during
 * hydration, so on its own it lets every fresh page straight through.
 *
 * Not the security boundary either - every Convex function checks a capability.
 * This is what turns "six screens of refusals" into a sign-in screen.
 */
const isPublicRoute = createRouteMatcher(['/sign-in(.*)'])

/** Assets, data payloads and anything with a file extension are not pages. */
function isPageRequest(path: string): boolean {
  if (path.startsWith('/_nuxt') || path.startsWith('/__nuxt') || path.startsWith('/api')) {
    return false
  }
  if (path.startsWith('/_') || path.includes('.')) return false
  return true
}

export default clerkMiddleware(async (event) => {
  const path = event.path.split('?')[0] ?? '/'
  if (!isPageRequest(path) || isPublicRoute(event)) return

  const config = useRuntimeConfig(event)
  if (String(config.public.allowUnauthenticated) === 'true') return

  const { userId } = event.context.auth()
  if (userId) return

  const redirect = encodeURIComponent(event.path)
  return sendRedirect(event, `/sign-in?redirect=${redirect}`, 302)
})
