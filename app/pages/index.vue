<script setup lang="ts">
const { role, isPending, isSwitching, isPortalRole } = useViewer()
const clerk = useClerk()

useHead({ title: computed(() => (isPortalRole.value ? 'Portal' : 'Overview')) })
</script>

<template>
  <div v-if="isPending || isSwitching" class="grid grid-cols-12 gap-6" aria-busy="true">
    <div
      v-for="n in 3"
      :key="n"
      class="col-span-12 h-[132px] animate-pulse rounded-lg bg-surface shadow-card md:col-span-6 xl:col-span-4"
    />
  </div>

  <div
    v-else-if="!role"
    class="mx-auto max-w-lg rounded-lg bg-surface p-8 text-center shadow-card"
  >
    <h1 class="font-display text-section font-medium text-ink">Account not on school roll</h1>
    <p class="mt-2 text-body text-ink-secondary">
      This email is not registered in People yet. Ask a school administrator to add your email
      with your role, or sign in with your assigned school email.
    </p>
    <AppButton class="mt-6" variant="secondary" @click="clerk?.signOut({ redirectUrl: '/sign-in' })">
      Sign out
    </AppButton>
  </div>

  <PortalFamilyStudentView v-else-if="isPortalRole" />

  <OverviewStaffDashboard v-else />
</template>
