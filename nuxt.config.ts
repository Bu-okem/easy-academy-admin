import { readFileSync } from 'node:fs'

/**
 * `npx convex dev` owns .env.local and rewrites it, so it is read here rather
 * than copied into .env — two files, one owner each, nothing to drift.
 * Nuxt loads .env itself, which is also where `clerk env pull` writes.
 */
function convexEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name]
  try {
    const line = readFileSync('.env.local', 'utf8')
      .split('\n')
      .find((entry) => entry.startsWith(`${name}=`))
    return line?.slice(name.length + 1).trim() || undefined
  } catch {
    return undefined
  }
}

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    '@nuxt/fonts',
    '@nuxt/hints',
    '@nuxt/icon',
    '@nuxt/image',
    '@artmizu/nuxt-prometheus',
    '@clerk/nuxt',
    '@nuxtjs/color-mode',
    '@nuxtjs/device',
    '@nuxtjs/seo',
    '@nuxtjs/svg-sprite',
    '@nuxtjs/tailwindcss',
    'convex-nuxt'
  ],

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      // Mirrors DEV_UNAUTHENTICATED_ROLE on the Convex deployment: set only to
      // work on the app before Clerk is provisioned. Anything other than "true"
      // means routes are protected.
      allowUnauthenticated: '',
    },
  },

  tailwindcss: {
    cssPath: '~/assets/css/main.css'
  },

  // Fraunces for the ledger voice, Inter for UI. See docs/DESIGN.md section 2.
  fonts: {
    families: [
      { name: 'Fraunces', provider: 'google', weights: [500, 600] },
      { name: 'Inter', provider: 'google', weights: [400, 500, 600] }
    ]
  },

  // The product is a single warm-paper theme; no dark mode in the design system.
  colorMode: {
    preference: 'light',
    fallback: 'light'
  },

  // Admin panel sits behind auth, so there are no link previews to render.
  // Leaving og-image on makes it prompt for a renderer on every dev startup.
  ogImage: { enabled: false },

  convex: {
    url: convexEnv('CONVEX_URL')
  },
})
