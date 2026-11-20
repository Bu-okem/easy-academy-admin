/**
 * Domain functions return a Result instead of throwing, so no framework's error
 * type reaches the domain layer. Adapters translate a failure into whatever
 * their host expects (ConvexError today, an HTTP status elsewhere).
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })
