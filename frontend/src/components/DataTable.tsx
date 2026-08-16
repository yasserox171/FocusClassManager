import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState, Spinner } from './ui'

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  loading?: boolean
  emptyMessage?: string
  /** Server side pagination - omit for a plain table. */
  page?: number
  pageSize?: number
  total?: number
  onPageChange?: (page: number) => void
  onRowClick?: (row: T) => void
}

export function DataTable<T>({
  columns,
  data,
  loading = false,
  emptyMessage,
  page,
  pageSize = 25,
  total,
  onPageChange,
  onRowClick,
}: DataTableProps<T>) {
  const { t, i18n } = useTranslation()
  const [sorting, setSorting] = useState<SortingState>([])
  const isRtl = i18n.language.startsWith('ar')

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
  })

  if (loading) return <Spinner />
  if (data.length === 0) {
    return <EmptyState message={emptyMessage ?? t('common.noData')} />
  }

  const totalPages = total !== undefined ? Math.max(1, Math.ceil(total / pageSize)) : 1
  const showPagination = page !== undefined && onPageChange !== undefined && totalPages > 1
  const PreviousIcon = isRtl ? ChevronRight : ChevronLeft
  const NextIcon = isRtl ? ChevronLeft : ChevronRight

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-start text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  return (
                    <th key={header.id} className="whitespace-nowrap px-4 py-3 text-start font-semibold">
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          disabled={!canSort}
                          onClick={header.column.getToggleSortingHandler()}
                          className={clsx(
                            'inline-flex items-center gap-1',
                            canSort && 'transition hover:text-slate-800',
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' && <ArrowUp size={12} />}
                          {sorted === 'desc' && <ArrowDown size={12} />}
                        </button>
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={clsx(
                  'transition hover:bg-slate-50',
                  onRowClick && 'cursor-pointer',
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-middle text-slate-700">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPagination && (
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
          <span>
            {total} {t('common.results')}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="rounded-lg border border-slate-300 p-1.5 transition hover:bg-slate-50 disabled:opacity-40"
              aria-label={t('common.previous')}
            >
              <PreviousIcon size={16} />
            </button>
            <span>
              {t('common.page')} {page} {t('common.of')} {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="rounded-lg border border-slate-300 p-1.5 transition hover:bg-slate-50 disabled:opacity-40"
              aria-label={t('common.next')}
            >
              <NextIcon size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
