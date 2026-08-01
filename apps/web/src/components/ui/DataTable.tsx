import Link from 'next/link'
import type { ReactNode } from 'react'
import { cx } from './styles'

export type Column<T> = {
  /** Stable key for React and for identifying the column. */
  key: string
  /** ReactNode so callers can pass a sort link rather than plain text. */
  header: ReactNode
  cell: (row: T) => ReactNode
  /** Extra classes applied to both the header cell and the body cells. */
  className?: string
  /**
   * Card layout roles on narrow screens:
   *  - 'title'   the card's headline (first column, usually the identifier)
   *  - 'meta'    shown beside the title, right-aligned (status, total)
   *  - 'row'     shown as a label/value row in the card body (the default)
   *  - 'hidden'  omitted from the card entirely
   */
  mobile?: 'title' | 'meta' | 'row' | 'hidden'
  /** Label used for the card's label/value row; falls back to `header`. */
  mobileLabel?: ReactNode
}

/**
 * Renders a real table from `sm:` up and a stacked card list below it.
 *
 * The app's tables were all wrapped in `overflow-x-auto`, which kept them from
 * breaking the layout but left a phone user scrolling a job list sideways. This
 * takes one set of column definitions and lays it out appropriately for each.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  getRowHref,
  empty,
  className,
}: {
  columns: Column<T>[]
  rows: T[]
  getRowKey: (row: T) => string
  /** When provided, each mobile card becomes a link to this href. */
  getRowHref?: (row: T) => string
  empty?: ReactNode
  className?: string
}) {
  if (rows.length === 0 && empty) return <>{empty}</>

  const titleCol = columns.find((c) => c.mobile === 'title') ?? columns[0]
  const metaCols = columns.filter((c) => c.mobile === 'meta')
  const rowCols = columns.filter(
    (c) => c !== titleCol && c.mobile !== 'meta' && c.mobile !== 'hidden',
  )

  return (
    <>
      <div className={cx('hidden overflow-x-auto rounded-lg border border-surface-border sm:block', className)}>
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-muted">
            <tr>
              {columns.map((col) => (
                <th key={col.key} scope="col" className={cx('px-4 py-2 font-medium', col.className)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getRowKey(row)} className="border-t border-surface-border hover:bg-surface">
                {columns.map((col) => (
                  <td key={col.key} className={cx('px-4 py-2', col.className)}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className={cx('flex flex-col gap-2 sm:hidden', className)}>
        {rows.map((row) => {
          const href = getRowHref?.(row)
          const body = (
            <>
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{titleCol.cell(row)}</span>
                {metaCols.length > 0 && (
                  <span className="flex shrink-0 items-center gap-2">
                    {metaCols.map((col) => (
                      <span key={col.key}>{col.cell(row)}</span>
                    ))}
                  </span>
                )}
              </div>
              {rowCols.length > 0 && (
                <dl className="mt-2 flex flex-col gap-1 text-sm">
                  {rowCols.map((col) => (
                    <div key={col.key} className="flex justify-between gap-3">
                      <dt className="text-muted">{col.mobileLabel ?? col.header}</dt>
                      <dd className="text-right">{col.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          )

          // The whole card is tappable, but the link sits as an overlay sibling
          // rather than wrapping the content — cells commonly contain their own
          // links, and nesting <a> inside <a> is invalid HTML and breaks
          // hydration. It's hidden from assistive tech because the title cell
          // already exposes the same destination.
          return (
            <li key={getRowKey(row)} className={cx(href && 'relative')}>
              <div className="rounded-lg border border-surface-border p-3">{body}</div>
              {href && (
                <Link
                  href={href}
                  aria-hidden="true"
                  tabIndex={-1}
                  className="absolute inset-0 rounded-lg active:bg-foreground/5"
                />
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
