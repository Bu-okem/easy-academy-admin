import { ConvexError, v } from 'convex/values'
import { mutation } from './_generated/server'
import { requireCapability } from './lib/access'
import { convexAttendanceRepository } from './adapters/attendance'
import { asId } from '../domain/ids'
import {
  describeAttendanceProblem,
  recordAttendance,
} from '../domain/attendance/recordAttendance'

/**
 * Thin adapter: validate, build the repository, call the domain, translate the
 * result. No attendance rule lives in this file - see domain/attendance.
 */
export const record = mutation({
  args: {
    studentId: v.id('students'),
    classSectionId: v.id('classSections'),
    teacherId: v.id('teachers'),
    termId: v.id('terms'),
    attendanceDate: v.string(),
    status: v.union(
      v.literal('present'),
      v.literal('absent'),
      v.literal('late'),
      v.literal('excused')
    ),
    remarks: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCapability(ctx, 'register.take')
    const result = await recordAttendance(convexAttendanceRepository(ctx.db), {
      studentId: asId(args.studentId),
      classSectionId: asId(args.classSectionId),
      teacherId: asId(args.teacherId),
      termId: asId(args.termId),
      attendanceDate: args.attendanceDate,
      status: args.status,
      remarks: args.remarks,
    })

    if (!result.ok) {
      throw new ConvexError({
        code: result.error.kind,
        message: describeAttendanceProblem(result.error),
      })
    }

    return { outcome: result.value.outcome, recordId: result.value.record.id }
  },
})
