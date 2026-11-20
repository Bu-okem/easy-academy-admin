import { defineConfig } from 'vitest/config'

// Covers the code that runs without a runtime: domain/ (rules behind injected
// ports) and app/utils/ (pure UI helpers). Neither needs Nuxt, Convex or a
// browser, which is what keeps this suite fast enough to run constantly.
//
// Component tests would need a DOM environment and Nuxt's own test utilities;
// those get their own config rather than slowing this one down. Convex adapters
// stay uncovered - they hold no rules and testing them needs a live deployment.
export default defineConfig({
  test: {
    include: [
      'domain/**/*.test.ts',
      'app/utils/**/*.test.ts',
      // Structural checks over convex/ - they read source files, they do not
      // call Convex, so they need no deployment.
      'convex/**/*.test.ts',
    ],
    environment: 'node',
  },
})
