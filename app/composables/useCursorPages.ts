import type { FunctionReference, PaginationOptions, PaginationResult } from 'convex/server'

/**
 * Drives a paginated Convex query from a page-numbered UI (DESIGN.md 5.16).
 *
 * Convex pages with cursors, the table counts in pages, and this is where the
 * two meet: the cursor bookkeeping lives in `app/utils/cursorStack.ts`, and the
 * total row count comes from a separate `counts` query, because a cursor page
 * knows nothing about how many rows lie beyond it.
 *
 * Navigation is sequential by construction - see the note in cursorStack.ts.
 */
export function useCursorPages<Row>(
  query: FunctionReference<'query', 'public', { paginationOpts: PaginationOptions }, PaginationResult<Row>>,
  pageSize: number,
) {
  const page = ref(1)
  const cursors = ref(newCursorStack())

  const args = computed(() => ({
    paginationOpts: {
      numItems: pageSize,
      cursor: cursorFor(cursors.value, page.value) ?? null,
    },
  }))

  const { data, error, isPending } = useConvexQuery(query, args)

  watch(data, (result) => {
    if (!result) return
    // isDone means there is no page after this one, whatever cursor came back.
    cursors.value = withNextCursor(
      cursors.value,
      page.value,
      result.isDone ? null : result.continueCursor,
    )
  })

  const rows = computed<Row[]>(() => data.value?.page ?? [])

  function goTo(requested: number) {
    page.value = clampToReachable(cursors.value, requested)
  }

  /** Start over - used when the list being paged changes entirely. */
  function reset() {
    page.value = 1
    cursors.value = newCursorStack()
  }

  return { page, rows, error, isPending, goTo, reset }
}
