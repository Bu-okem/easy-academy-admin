/** Column definition for DataTable (docs/DESIGN.md 5.9). */
export interface DataTableColumn<T> {
  /** Matches the `#cell-<key>` slot name and, by default, the row property read. */
  key: string
  label: string
  /** Numbers and dates read better trailing; everything else leads. */
  align?: 'start' | 'end'
  /** Tailwind width utility, e.g. `w-40`, when a column should not size to content. */
  width?: string
  /** Derive the displayed text. Falls back to `row[key]` when omitted. */
  value?: (row: T) => string | number | null | undefined
}
