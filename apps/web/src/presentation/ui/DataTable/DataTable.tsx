import type { JSX, ReactNode } from 'react';
import { Checkbox } from '@/presentation/ui/Checkbox';
import { DataTableShell } from './DataTableShell';
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
  /**
   * The phone rendering of the same rows. Required, not optional: the table is
   * hidden below md, so a consumer that omitted this would render nothing at
   * all there. It lives inside the shell so the toolbar that filters it and the
   * bulk actions that act on it stay attached to the list they belong to.
   */
  mobileList: ReactNode;
  /** Fill the column and scroll the rows instead of the page. See DataTableShell. */
  fill?: boolean;
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
  mobileList,
  fill = false,
}: DataTableProps<T>): JSX.Element {
  return (
    <DataTableShell fill={fill} toolbar={toolbar}>
      {rows.length === 0 ? (
        emptyState
      ) : (
        <>
          <div data-testid="data-table-mobile" className="md:hidden">
            {mobileList}
          </div>
          <table className="hidden w-full table-fixed md:table">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10 bg-surface">
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
                  const isString = typeof value === 'string';
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
                            : isString
                              ? 'block truncate'
                              : 'block overflow-hidden'
                        }
                        title={column.breakAll || !isString ? undefined : value}
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
        </>
      )}
    </DataTableShell>
  );
}
