import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const convexDir = fileURLToPath(new URL('.', import.meta.url))

/**
 * Every publicly callable Convex function must check a capability.
 *
 * A function without a guard is reachable by anyone who can reach the deployment
 * URL, and it is the kind of omission that is invisible in review: the function
 * works perfectly, it just works for everybody. This fails the build instead.
 *
 * `internalMutation` and `internalQuery` are exempt by construction - Convex does
 * not expose them - which is why the seed does not appear here.
 */
function convexFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '_generated' || entry.name === 'lib') return []
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return convexFiles(path)
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
      ? [path]
      : []
  })
}

/** `export const name = query({ ... })` up to the matching close. */
function publicFunctions(source: string): { name: string; body: string }[] {
  const found: { name: string; body: string }[] = []
  const pattern = /export const (\w+) = (query|mutation)\(\{/g

  for (const match of source.matchAll(pattern)) {
    const start = match.index + match[0].length
    let depth = 1
    let i = start
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') depth--
      i++
    }
    found.push({ name: match[1]!, body: source.slice(start, i) })
  }
  return found
}

describe('every public Convex function is guarded', () => {
  const files = convexFiles(convexDir)

  it('finds the function files', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  const cases = files.flatMap((path) => {
    const source = readFileSync(path, 'utf8')
    return publicFunctions(source).map(
      (fn) => [`${path.slice(convexDir.length)}:${fn.name}`, fn.body] as const
    )
  })

  it('finds public functions to check', () => {
    expect(cases.length).toBeGreaterThan(10)
  })

  it.each(cases)('%s requires a capability', (_label, body) => {
    expect(body).toContain('requireCapability(ctx,')
  })
})
