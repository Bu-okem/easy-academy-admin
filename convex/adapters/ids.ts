import type { Id, TableNames } from '../_generated/dataModel'

/**
 * The single point where the two identifier representations meet.
 *
 * Domain ids (`domain/ids.ts`) and Convex ids are both branded strings, but with
 * different brands, so neither is assignable to the other and TypeScript rejects
 * a direct cast. That is the type system doing its job: it is what stops Convex
 * ids leaking into the domain layer.
 *
 * Rather than scatter double casts through every adapter, the conversion is
 * named, documented and confined to this file. Going the other way needs no
 * helper - a Convex id is already a string, so `asId()` from the domain accepts
 * it directly.
 */
export function toConvexId<T extends TableNames>(id: string): Id<T> {
  return id as unknown as Id<T>
}
