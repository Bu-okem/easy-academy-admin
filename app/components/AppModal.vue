<script setup lang="ts">
// DESIGN.md 5.13 - surface, radius-lg, shadow-modal, max-width 480px.
//
// Built on the native <dialog>: showModal() traps focus, makes the rest of the
// page inert and handles Escape. Hand-rolled modals routinely get those wrong,
// and getting them wrong is what makes a dialog unusable with a keyboard.
const props = defineProps<{ title: string; wide?: boolean }>()

const open = defineModel<boolean>('open', { required: true })
const dialog = useTemplateRef<HTMLDialogElement>('dialog')

watch(open, (isOpen) => {
  const element = dialog.value
  if (!element) return
  if (isOpen && !element.open) element.showModal()
  if (!isOpen && element.open) element.close()
})

onMounted(() => {
  const element = dialog.value
  if (open.value && element && !element.open) element.showModal()
})

/** Fires for Escape as well as close(), so the model never drifts from the DOM. */
function onClose() {
  open.value = false
}

/** A click on the backdrop lands on the dialog itself, not its contents. */
function onClick(event: MouseEvent) {
  if (event.target === dialog.value) open.value = false
}

const titleId = useId()
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="titleId"
    class="w-full rounded-lg bg-surface p-0 text-ink shadow-modal backdrop:bg-ink/30"
    :class="props.wide ? 'max-w-[720px]' : 'max-w-[480px]'"
    @close="onClose"
    @click="onClick"
  >
    <div class="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
      <h2 :id="titleId" class="font-display text-section font-medium text-ink">
        {{ props.title }}
      </h2>
      <button
        type="button"
        class="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-page"
        aria-label="Close"
        @click="open = false"
      >
        <AppIcon name="close" />
      </button>
    </div>

    <div class="px-6 pb-6">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="flex justify-end gap-3 border-t border-hairline px-6 py-4">
      <slot name="footer" />
    </footer>
  </dialog>
</template>
