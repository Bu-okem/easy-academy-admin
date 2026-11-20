import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const domainDir = fileURLToPath(new URL('.', import.meta.url))

/**
 * The domain layer must stay portable: switching databases should mean writing
 * a new adapter, never editing a rule. This test is what stops that eroding one
 * convenient import at a time. See docs/ARCHITECTURE.md.
 */
const forbidden = [
  { pattern: /convex/i, reason: 'Convex' },
  { pattern: /^nuxt$|^#(app|imports)/, reason: 'Nuxt' },
  { pattern: /^vue$|^vue-router$/, reason: 'Vue' },
]

function typescriptFilesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return typescriptFilesIn(path)
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : []
  })
}

/** Module specifiers only - a mention of "convex" in a comment is not an import. */
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]!)
  }
  return specifiers
}

describe('domain layer boundary', () => {
  const files = typescriptFilesIn(domainDir)

  it('finds domain files to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files.map((f) => [f.slice(domainDir.length), f] as const))(
    '%s imports no database or framework',
    (_label, path) => {
      const offenders = importSpecifiers(readFileSync(path, 'utf8'))
        .map((specifier) => {
          const hit = forbidden.find((rule) => rule.pattern.test(specifier))
          return hit ? `${specifier} (${hit.reason})` : null
        })
        .filter((v): v is string => v !== null)

      expect(offenders).toEqual([])
    }
  )
})
