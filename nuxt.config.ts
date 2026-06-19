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
    '@nuxtjs/google-fonts',
    '@nuxtjs/seo',
    '@nuxtjs/svg-sprite',
    '@nuxtjs/tailwindcss',
    'convex-nuxt'
  ],
convex: {
    url: process.env.CONVEX_URL
  },
})
