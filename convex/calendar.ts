import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { canViewerSwitchRole, requireCapability } from './lib/access'
import { activeYearAndTerm } from './lib/calendar'
import { toConvexId } from './adapters/ids'
import { capabilitiesOf } from '../domain/access/policy'

/**
 * The academic year and term the school is currently in, for the top bar's
 * switcher. Separate from overview:stats so every screen can show the same
 * calendar without pulling the Overview's figures with it.
 */
export const active = query({
  args: {},
  handler: async (ctx) => {
    await requireCapability(ctx, 'portal.view')
    const [calendar, allYears] = await Promise.all([
      activeYearAndTerm(ctx),
      ctx.db.query('academicYears').collect(),
    ])
    if (!calendar) return null

    const { activeYear, terms, currentTerm } = calendar

    return {
      academicYear: activeYear.name,
      term: currentTerm?.name ?? null,
      // Anything writing a dated record needs the term it belongs to.
      termId: currentTerm?._id ?? null,
      // The switcher will offer these; ordering by start date keeps them in
      // school order rather than insertion order.
      terms: terms.map((term) => ({ id: term._id, name: term.name })),
      years: [...allYears]
        .sort((a, b) => b.name.localeCompare(a.name))
        .map((year) => ({ id: year._id, name: year.name, isActive: year.isActive })),
    }
  },
})

/**
 * Persists `authTokenIdentifier` on first sign-in for a pre-imported user
 * matched by email, since queries cannot write to the database.
 */
export const linkSession = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireCapability(ctx, 'portal.view')
    return viewer.userId
  },
})

/** Returns the signed-in caller's role, capabilities and whether they can preview roles. */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const current = await requireCapability(ctx, 'portal.view')
    const canSwitchRole = await canViewerSwitchRole(ctx)
    return {
      userId: current.userId,
      role: current.role,
      capabilities: capabilitiesOf(current.role),
      canSwitchRole,
    }
  },
})

/** Switches the active role for an administrator account to preview any role view. */
export const switchViewerRole = mutation({
  args: {
    role: v.union(
      v.literal('admin'),
      v.literal('teacher'),
      v.literal('staff'),
      v.literal('parent'),
      v.literal('student')
    ),
  },
  handler: async (ctx, { role }) => {
    const current = await requireCapability(ctx, 'portal.view')
    if (!(await canViewerSwitchRole(ctx))) {
      throw new ConvexError({
        code: 'forbidden',
        message: 'Only an administrator account can switch preview roles.',
      })
    }

    const userId = toConvexId<'users'>(current.userId)
    const user = await ctx.db.get(userId)
    if (!user) {
      throw new ConvexError({ code: 'notFound', message: 'User account not found.' })
    }

    await ctx.db.patch(userId, {
      role,
      passwordHash: 'managed-by-clerk:admin',
    })

    return role
  },
})
