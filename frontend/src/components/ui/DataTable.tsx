import React from 'react';
import { cn } from '../../lib/utils';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyFn: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

export function DataTable<T>({
  columns, rows, keyFn, onRowClick, emptyTitle = 'No data', emptyDescription, className,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className={cn('bg-white border border-gray-200/80 rounded-2xl', className)}>
        <EmptyState title={emptyTitle} description={emptyDescription} size="md" />
      </div>
    );
  }

  return (
    <div className={cn('bg-white border border-gray-200/80 rounded-2xl overflow-hidden shadow-card', className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/70">
              {columns.map((col) => (
                <th key={col.key} className={cn('table-th', col.headerClassName)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={keyFn(row)}
                className={cn('table-tr', onRowClick && 'cursor-pointer')}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn('table-td', col.className)}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
