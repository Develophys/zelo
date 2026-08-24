import type { JSX, ReactNode } from 'react';
import { Checkbox } from '@/presentation/ui/Checkbox';
import type { DataTableSelection } from './useDataTableSelection';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  width: string;
  cell(row: T): ReactNode;
  hideBelowLg?: boolean;
  breakAll?: boolean;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  selection: DataTableSelection<T>;
  rowActions(row: T): ReactNode;
  toolbar: ReactNode;
  emptyState: ReactNode;
  caption: string;
}

function rowLabel(row: { name?: string; id: string }): string {
  return row.name ?? row.id;
}

export function DataTable<T extends { id: string; isActive: boolean; name?: string }>({
  columns,
  rows,
  selection,
  rowActions,
  toolbar,
  emptyState,
  caption,
}: DataTableProps<T>): JSX.Element {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      {toolbar}
      {rows.length === 0 ? (
        emptyState
      ) : (
        <table className="hidden w-full table-fixed md:table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="w-12 px-cell-x py-cell-y">
                <span className="sr-only">Seleção</span>
              </th>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`px-cell-x py-cell-y text-left font-sans text-caption font-semibold text-muted uppercase ${column.width} ${
                    column.hideBelowLg ? 'hidden lg:table-cell' : ''
                  }`}
                >
                  {column.header}
                </th>
              ))}
              <th scope="col" className="w-28 px-cell-x py-cell-y">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-b border-line last:border-b-0 ${
                  selection.isSelected(row.id) ? 'bg-brand/5' : ''
                }`}
              >
                <td className="px-cell-x py-cell-y">
                  <Checkbox
                    aria-label={`Selecionar ${rowLabel(row)}`}
                    checked={selection.isSelected(row.id)}
                    onChange={() => selection.toggle(row.id)}
                  />
                </td>
                {columns.map((column) => {
                  const value = column.cell(row);
                  return (
                    <td
                      key={column.key}
                      className={`px-cell-x py-cell-y text-label text-ink ${column.width} ${
                        column.hideBelowLg ? 'hidden lg:table-cell' : ''
                      }`}
                    >
                      <span
                        className={
                          column.breakAll
                            ? 'block break-all whitespace-normal'
                            : 'block truncate'
                        }
                        title={column.breakAll || typeof value !== 'string' ? undefined : value}
                      >
                        {value}
                      </span>
                    </td>
                  );
                })}
                <td className="px-cell-x py-cell-y">
                  <div className="flex items-center justify-end gap-1">{rowActions(row)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
