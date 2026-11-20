<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Signing in…' })
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center gap-4 bg-page px-6">
    <div class="h-10 w-10 animate-spin rounded-full border-2 border-hairline border-t-brass" />
    <p class="text-body text-ink-secondary">Completing sign-in…</p>
    <ClientOnly>
      <AuthenticateWithRedirectCallback />
    </ClientOnly>
  </div>
</template>
