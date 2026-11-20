import { ConvexError } from 'convex/values'
import type { Doc } from '../_generated/dataModel'
import type { QueryCtx, MutationCtx } from '../_generated/server'
import { asId } from '../../domain/ids'
import {
  can,
  describeDenial,
  type Capability,
  type Role,
  type Viewer,
} from '../../domain/access/policy'

const ROLES: readonly Role[] = ['admin', 'teacher', 'staff', 'parent', 'student']
const ADMIN_PREVIEW_MARKER = 'managed-by-clerk:admin'

/**
 * The role unauthenticated callers are treated as, for local development only.
 *
 *   npx convex env set DEV_UNAUTHENTICATED_ROLE admin     # open the dev deployment
 *   npx convex env remove DEV_UNAUTHENTICATED_ROLE        # back to refusing
 *
 * **Unset means refuse**, so a deployment that was never deliberately opened is
 * closed. Never set this on a deployment holding real people's records: it makes
 * every guarded function callable by anyone who can reach the URL.
 */
function developmentRole(): Role | null {
  const configured = process.env.DEV_UNAUTHENTICATED_ROLE
  if (!configured) return null
  return ROLES.includes(configured as Role) ? (configured as Role) : null
}

async function findUserForIdentity(
  ctx: QueryCtx | MutationCtx
): Promise<{ user: Doc<'users'>; byToken: boolean } | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null

  // tokenIdentifier, not subject: the Convex guidelines are explicit that
  // `subject` alone is not a global identity key, because it is only unique
  // within an issuer.
  const byToken = await ctx.db
    .query('users')
    .withIndex('by_auth_token', (q) =>
      q.eq('authTokenIdentifier', identity.tokenIdentifier)
    )
    .first()

  if (byToken) return { user: byToken, byToken: true }

  const byEmail = identity.email
    ? await ctx.db
        .query('users')
        .withIndex('by_email', (q) => q.eq('email', identity.email!))
        .first()
    : null

  if (!byEmail) return null

  if ('patch' in ctx.db) {
    await ctx.db.patch(byEmail._id, { authTokenIdentifier: identity.tokenIdentifier })
  }

  return { user: byEmail, byToken: false }
}

/** Whether the caller belongs to an administrator account (even while previewing another role). */
export async function canViewerSwitchRole(ctx: QueryCtx | MutationCtx): Promise<boolean> {
  const resolved = await findUserForIdentity(ctx)
  if (!resolved) return false
  return resolved.user.role === 'admin' || resolved.user.passwordHash === ADMIN_PREVIEW_MARKER
}

/**
 * Who is calling, or null if nobody recognisable is.
 *
 * A Clerk identity is matched to the school's own user record. The match is by
 * `authTokenIdentifier` first and by email second: a school imports its roll
 * before anyone signs in, so the first sign-in has an email and no link yet.
 * A query cannot write, so any mutation running for an email-matched user
 * (including `calendar:linkSession` on sign-in) persists `authTokenIdentifier`.
 */
export async function viewerOf(ctx: QueryCtx | MutationCtx): Promise<Viewer | null> {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity) {
    const role = developmentRole()
    return role ? { userId: asId('development'), role } : null
  }

  const resolved = await findUserForIdentity(ctx)
  if (!resolved) return null
  const { user } = resolved
  const isAdminPreview = user.passwordHash === ADMIN_PREVIEW_MARKER

  const viewer: Viewer = { userId: asId(user._id), role: user.role }

  if (user.role === 'student') {
    const own = await ctx.db
      .query('students')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .first()
    const student = own ?? (isAdminPreview ? await ctx.db.query('students').first() : null)
    if (student) viewer.studentId = asId(student._id)
  }

  if (user.role === 'parent') {
    const links = await ctx.db
      .query('parentStudentRelations')
      .withIndex('by_parent', (q) => q.eq('parentId', user._id))
      .collect()

    if (links.length > 0) {
      viewer.children = links.map((link) => asId(link.studentId))
    } else if (isAdminPreview) {
      const allLinks = await ctx.db.query('parentStudentRelations').collect()
      const grouped = new Map<string, typeof allLinks>()
      for (const link of allLinks) {
        const list = grouped.get(link.parentId) ?? []
        list.push(link)
        grouped.set(link.parentId, list)
      }
      const multiChild = [...grouped.values()].find((group) => group.length > 1)
      const fallback = multiChild ?? [...grouped.values()][0] ?? []
      viewer.children = fallback.map((link) => asId(link.studentId))
    } else {
      viewer.children = []
    }
  }

  return viewer
}

/**
 * Refuses unless the caller holds the capability. Every guarded function starts
 * with this; the decision about who holds what lives in domain/access/policy.ts.
 */
export async function requireCapability(
  ctx: QueryCtx | MutationCtx,
  capability: Capability
): Promise<Viewer> {
  const viewer = await viewerOf(ctx)

  if (!viewer) {
    throw new ConvexError({
      code: 'notSignedIn',
      message: 'Sign in to continue.',
    })
  }

  if (!can(viewer.role, capability)) {
    throw new ConvexError({
      code: 'forbidden',
      message: describeDenial(capability),
    })
  }

  return viewer
}
