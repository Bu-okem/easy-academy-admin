<script setup lang="ts">
// Sign-in sits outside the application shell: there is no sidebar to show
// someone who cannot yet see anything behind it.
definePageMeta({ layout: false })

type AuthMode = 'sign-in' | 'activate' | 'reset'
type ActivateStep = 'credentials' | 'verify-email'
type ResetStep = 'request' | 'confirm'

const route = useRoute()
const { isSignedIn } = useAuth()
const { isLoaded: isSignInLoaded, signIn, setActive: setSignInActive } = useSignIn()
const { isLoaded: isSignUpLoaded, signUp, setActive: setSignUpActive } = useSignUp()

const redirect = computed(() => {
  const target = route.query.redirect
  if (typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')) {
    return target
  }
  return '/'
})

const mode = ref<AuthMode>(route.query.mode === 'activate' ? 'activate' : 'sign-in')
const activateStep = ref<ActivateStep>('credentials')
const resetStep = ref<ResetStep>('request')

const email = ref('')
const password = ref('')
const newPassword = ref('')
const showPassword = ref(false)
const verificationCode = ref('')
const errorMessage = ref<string | null>(null)
const isSubmitting = ref(false)

watch(
  isSignedIn,
  (signedIn) => {
    if (signedIn) {
      navigateTo(redirect.value)
    }
  },
  { immediate: true }
)

function switchMode(next: AuthMode) {
  mode.value = next
  activateStep.value = 'credentials'
  resetStep.value = 'request'
  verificationCode.value = ''
  newPassword.value = ''
  showPassword.value = false
  errorMessage.value = null
}

function extractClerkError(error: unknown): string {
  if (error && typeof error === 'object' && 'errors' in error) {
    const errors = (error as { errors?: Array<{ longMessage?: string; message?: string }> }).errors
    const first = errors?.[0]
    if (first?.longMessage) return first.longMessage
    if (first?.message) return first.message
  }
  if (error instanceof Error && error.message) return error.message
  return 'Could not complete authentication. Please check your details and try again.'
}

async function handleGoogleAuth() {
  if (!isSignInLoaded.value || !signIn.value || isSubmitting.value) return
  errorMessage.value = null
  isSubmitting.value = true
  try {
    await signIn.value.authenticateWithRedirect({
      strategy: 'oauth_google',
      redirectUrl: '/sign-in/sso-callback',
      redirectUrlComplete: redirect.value,
    })
  } catch (error) {
    errorMessage.value = extractClerkError(error)
    isSubmitting.value = false
  }
}

async function handleSignIn() {
  if (!isSignInLoaded.value || !signIn.value || isSubmitting.value) return
  errorMessage.value = null
  isSubmitting.value = true
  try {
    const result = await signIn.value.create({
      identifier: email.value.trim(),
      password: password.value,
    })

    if (result.status === 'complete' && result.createdSessionId) {
      await setSignInActive.value?.({ session: result.createdSessionId })
      await navigateTo(redirect.value)
      return
    }

    errorMessage.value = 'Additional verification is required for this account.'
  } catch (error) {
    errorMessage.value = extractClerkError(error)
  } finally {
    isSubmitting.value = false
  }
}

async function handleActivate() {
  if (!isSignUpLoaded.value || !signUp.value || isSubmitting.value) return
  errorMessage.value = null
  isSubmitting.value = true
  try {
    const result = await signUp.value.create({
      emailAddress: email.value.trim(),
      password: password.value,
    })

    if (result.status === 'complete' && result.createdSessionId) {
      await setSignUpActive.value?.({ session: result.createdSessionId })
      await navigateTo(redirect.value)
      return
    }

    if (result.status === 'missing_requirements') {
      await signUp.value.prepareEmailAddressVerification({ strategy: 'email_code' })
      activateStep.value = 'verify-email'
      return
    }

    errorMessage.value = 'Account activation could not be completed. Please try again.'
  } catch (error) {
    errorMessage.value = extractClerkError(error)
  } finally {
    isSubmitting.value = false
  }
}

async function handleVerifyEmail() {
  if (!isSignUpLoaded.value || !signUp.value || isSubmitting.value) return
  errorMessage.value = null
  isSubmitting.value = true
  try {
    const result = await signUp.value.attemptEmailAddressVerification({
      code: verificationCode.value.trim(),
    })

    if (result.status === 'complete' && result.createdSessionId) {
      await setSignUpActive.value?.({ session: result.createdSessionId })
      await navigateTo(redirect.value)
      return
    }

    errorMessage.value = 'Verification is incomplete. Please request a new code and try again.'
  } catch (error) {
    errorMessage.value = extractClerkError(error)
  } finally {
    isSubmitting.value = false
  }
}

async function resendCode() {
  if (!isSignUpLoaded.value || !signUp.value || isSubmitting.value) return
  errorMessage.value = null
  try {
    await signUp.value.prepareEmailAddressVerification({ strategy: 'email_code' })
  } catch (error) {
    errorMessage.value = extractClerkError(error)
  }
}

async function handleRequestReset() {
  if (!isSignInLoaded.value || !signIn.value || isSubmitting.value) return
  errorMessage.value = null
  isSubmitting.value = true
  try {
    const attempt = await signIn.value.create({
      identifier: email.value.trim(),
    })

    const resetFactor = attempt.supportedFirstFactors?.find(
      (factor) => factor.strategy === 'reset_password_email_code'
    )

    if (!resetFactor || !('emailAddressId' in resetFactor)) {
      errorMessage.value =
        'Password reset by email is not available for this account. Make sure Password login is enabled in Clerk, or use Activate account / Continue with Google.'
      return
    }

    await signIn.value.prepareFirstFactor({
      strategy: 'reset_password_email_code',
      emailAddressId: resetFactor.emailAddressId,
    })

    verificationCode.value = ''
    newPassword.value = ''
    resetStep.value = 'confirm'
  } catch (error) {
    errorMessage.value = extractClerkError(error)
  } finally {
    isSubmitting.value = false
  }
}

async function handleConfirmReset() {
  if (!isSignInLoaded.value || !signIn.value || isSubmitting.value) return
  errorMessage.value = null
  isSubmitting.value = true
  try {
    const result = await signIn.value.attemptFirstFactor({
      strategy: 'reset_password_email_code',
      code: verificationCode.value.trim(),
      password: newPassword.value,
    })

    if (result.status === 'complete' && result.createdSessionId) {
      await setSignInActive.value?.({ session: result.createdSessionId })
      await navigateTo(redirect.value)
      return
    }

    errorMessage.value = 'Password update could not be completed. Please try again.'
  } catch (error) {
    errorMessage.value = extractClerkError(error)
  } finally {
    isSubmitting.value = false
  }
}

useHead({
  title: computed(() => {
    if (mode.value === 'activate') return 'Activate account'
    if (mode.value === 'reset') return 'Set password'
    return 'Sign in'
  }),
})
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center gap-8 bg-page px-6 py-12">
    <div class="text-center">
      <p class="font-display text-greeting font-medium text-ink">Easy Academy Admin</p>
      <p class="mt-1 text-body text-ink-secondary">
        {{
          mode === 'sign-in'
            ? 'Sign in with your school account to continue.'
            : 'Activate your account using the email added by your school administrator.'
        }}
      </p>
    </div>

    <div class="w-full max-w-md rounded-lg bg-surface p-6 shadow-card">
      <div
        role="tablist"
        aria-label="Authentication mode"
        class="mb-6 grid grid-cols-2 gap-1 rounded-sm bg-page p-1"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'sign-in'"
          class="rounded-sm px-3 py-2 text-caption font-semibold transition"
          :class="
            mode === 'sign-in'
              ? 'bg-surface text-ink shadow-sm'
              : 'text-ink-secondary hover:text-ink'
          "
          @click="switchMode('sign-in')"
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'activate'"
          class="rounded-sm px-3 py-2 text-caption font-semibold transition"
          :class="
            mode === 'activate'
              ? 'bg-surface text-ink shadow-sm'
              : 'text-ink-secondary hover:text-ink'
          "
          @click="switchMode('activate')"
        >
          Activate account
        </button>
      </div>

      <p
        v-if="errorMessage"
        role="alert"
        class="mb-4 rounded-sm bg-danger-bg px-3.5 py-2.5 text-caption text-danger-text"
      >
        {{ errorMessage }}
      </p>

      <template v-if="mode === 'sign-in' || activateStep === 'credentials'">
        <button
          type="button"
          :disabled="!isSignInLoaded || isSubmitting"
          class="flex w-full items-center justify-center gap-2.5 rounded-sm border border-hairline bg-surface px-4 py-2.5 text-body font-medium text-ink transition hover:bg-page disabled:opacity-50"
          @click="handleGoogleAuth"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
            />
          </svg>
          Continue with Google
        </button>

        <div class="my-5 flex items-center gap-3">
          <div class="h-px flex-1 bg-hairline" />
          <span class="text-badge font-medium uppercase tracking-wide text-ink-secondary">or</span>
          <div class="h-px flex-1 bg-hairline" />
        </div>
      </template>

      <!-- Sign in -->
      <form v-if="mode === 'sign-in'" class="flex flex-col gap-4" @submit.prevent="handleSignIn">
        <div>
          <label
            for="signin-email"
            class="block text-badge font-semibold uppercase tracking-wide text-ink-secondary"
          >
            School email
          </label>
          <input
            id="signin-email"
            v-model="email"
            type="email"
            autocomplete="email"
            required
            placeholder="name@school.edu"
            class="mt-1.5 w-full rounded-sm border border-hairline bg-surface px-3 py-2 text-body text-ink focus:border-brass focus:outline-none"
          />
        </div>

        <div>
          <div class="flex items-center justify-between gap-2">
            <label
              for="signin-password"
              class="block text-badge font-semibold uppercase tracking-wide text-ink-secondary"
            >
              Password
            </label>
            <button
              type="button"
              class="text-caption font-medium text-brass hover:underline"
              @click="switchMode('reset')"
            >
              Forgot / set password?
            </button>
          </div>
          <div class="relative mt-1.5">
            <input
              id="signin-password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              required
              placeholder="Enter your password"
              class="w-full rounded-sm border border-hairline bg-surface py-2 pl-3 pr-14 text-body text-ink focus:border-brass focus:outline-none"
            />
            <button
              type="button"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
              :aria-pressed="showPassword"
              class="absolute inset-y-0 right-0 px-3 text-caption font-medium text-ink-secondary hover:text-ink"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
        </div>

        <AppButton
          type="submit"
          class="mt-1 w-full justify-center"
          :disabled="!isSignInLoaded || isSubmitting"
        >
          {{ isSubmitting ? 'Signing in…' : 'Sign in' }}
        </AppButton>
      </form>

      <!-- Set / reset password: step 1 -->
      <form
        v-else-if="mode === 'reset' && resetStep === 'request'"
        class="flex flex-col gap-4"
        @submit.prevent="handleRequestReset"
      >
        <p class="text-body text-ink-secondary">
          Enter your school email to receive a one-time code to set or reset your password.
        </p>

        <div>
          <label
            for="reset-email"
            class="block text-badge font-semibold uppercase tracking-wide text-ink-secondary"
          >
            School email
          </label>
          <input
            id="reset-email"
            v-model="email"
            type="email"
            autocomplete="email"
            required
            placeholder="name@school.edu"
            class="mt-1.5 w-full rounded-sm border border-hairline bg-surface px-3 py-2 text-body text-ink focus:border-brass focus:outline-none"
          />
        </div>

        <AppButton
          type="submit"
          class="mt-1 w-full justify-center"
          :disabled="!isSignInLoaded || isSubmitting"
        >
          {{ isSubmitting ? 'Sending code…' : 'Send code' }}
        </AppButton>

        <button
          type="button"
          class="text-center text-caption text-ink-secondary hover:text-ink"
          @click="switchMode('sign-in')"
        >
          Back to sign in
        </button>
      </form>

      <!-- Set / reset password: step 2 -->
      <form
        v-else-if="mode === 'reset'"
        class="flex flex-col gap-4"
        @submit.prevent="handleConfirmReset"
      >
        <p class="text-body text-ink-secondary">
          Enter the code sent to <strong class="font-medium text-ink">{{ email }}</strong> and
          choose your new password.
        </p>

        <div>
          <label
            for="reset-code"
            class="block text-badge font-semibold uppercase tracking-wide text-ink-secondary"
          >
            Verification code
          </label>
          <input
            id="reset-code"
            v-model="verificationCode"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            required
            placeholder="6-digit code"
            class="mt-1.5 w-full rounded-sm border border-hairline bg-surface px-3 py-2 text-body tracking-widest text-ink focus:border-brass focus:outline-none"
          />
        </div>

        <div>
          <label
            for="reset-password"
            class="block text-badge font-semibold uppercase tracking-wide text-ink-secondary"
          >
            New password
          </label>
          <div class="relative mt-1.5">
            <input
              id="reset-password"
              v-model="newPassword"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              required
              minlength="8"
              placeholder="At least 8 characters"
              class="w-full rounded-sm border border-hairline bg-surface py-2 pl-3 pr-14 text-body text-ink focus:border-brass focus:outline-none"
            />
            <button
              type="button"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
              :aria-pressed="showPassword"
              class="absolute inset-y-0 right-0 px-3 text-caption font-medium text-ink-secondary hover:text-ink"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
        </div>

        <AppButton
          type="submit"
          class="mt-1 w-full justify-center"
          :disabled="!isSignInLoaded || isSubmitting"
        >
          {{ isSubmitting ? 'Saving password…' : 'Set password & sign in' }}
        </AppButton>

        <div class="flex items-center justify-between text-caption">
          <button
            type="button"
            class="font-medium text-brass hover:underline"
            @click="handleRequestReset"
          >
            Resend code
          </button>
          <button
            type="button"
            class="text-ink-secondary hover:text-ink"
            @click="switchMode('sign-in')"
          >
            Back to sign in
          </button>
        </div>
      </form>

      <!-- Activate account: step 1 (credentials) -->
      <form
        v-else-if="activateStep === 'credentials'"
        class="flex flex-col gap-4"
        @submit.prevent="handleActivate"
      >
        <p class="rounded-sm bg-page px-3.5 py-2.5 text-caption text-ink-secondary">
          Only emails pre-registered in <strong class="font-semibold text-ink">People</strong> can
          access the portal after activation.
        </p>

        <div>
          <label
            for="activate-email"
            class="block text-badge font-semibold uppercase tracking-wide text-ink-secondary"
          >
            School email
          </label>
          <input
            id="activate-email"
            v-model="email"
            type="email"
            autocomplete="email"
            required
            placeholder="name@school.edu"
            class="mt-1.5 w-full rounded-sm border border-hairline bg-surface px-3 py-2 text-body text-ink focus:border-brass focus:outline-none"
          />
        </div>

        <div>
          <label
            for="activate-password"
            class="block text-badge font-semibold uppercase tracking-wide text-ink-secondary"
          >
            Create password
          </label>
          <div class="relative mt-1.5">
            <input
              id="activate-password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              required
              minlength="8"
              placeholder="At least 8 characters"
              class="w-full rounded-sm border border-hairline bg-surface py-2 pl-3 pr-14 text-body text-ink focus:border-brass focus:outline-none"
            />
            <button
              type="button"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
              :aria-pressed="showPassword"
              class="absolute inset-y-0 right-0 px-3 text-caption font-medium text-ink-secondary hover:text-ink"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
        </div>

        <AppButton
          type="submit"
          class="mt-1 w-full justify-center"
          :disabled="!isSignUpLoaded || isSubmitting"
        >
          {{ isSubmitting ? 'Creating account…' : 'Continue' }}
        </AppButton>
      </form>

      <!-- Activate account: step 2 (email verification code) -->
      <form v-else class="flex flex-col gap-4" @submit.prevent="handleVerifyEmail">
        <p class="text-body text-ink-secondary">
          Enter the verification code sent to
          <strong class="font-medium text-ink">{{ email }}</strong>.
        </p>

        <div>
          <label
            for="verify-code"
            class="block text-badge font-semibold uppercase tracking-wide text-ink-secondary"
          >
            Verification code
          </label>
          <input
            id="verify-code"
            v-model="verificationCode"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            required
            placeholder="6-digit code"
            class="mt-1.5 w-full rounded-sm border border-hairline bg-surface px-3 py-2 text-body tracking-widest text-ink focus:border-brass focus:outline-none"
          />
        </div>

        <AppButton
          type="submit"
          class="mt-1 w-full justify-center"
          :disabled="!isSignUpLoaded || isSubmitting"
        >
          {{ isSubmitting ? 'Verifying…' : 'Verify & enter' }}
        </AppButton>

        <div class="flex items-center justify-between text-caption">
          <button
            type="button"
            class="font-medium text-brass hover:underline"
            @click="resendCode"
          >
            Resend code
          </button>
          <button
            type="button"
            class="text-ink-secondary hover:text-ink"
            @click="activateStep = 'credentials'"
          >
            Change email
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
