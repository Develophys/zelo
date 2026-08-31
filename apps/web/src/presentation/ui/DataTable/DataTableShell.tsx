import type { ReactNode } from 'react';

interface DataTableShellProps {
  toolbar: ReactNode;
  children: ReactNode;
  /**
   * Claim the remaining column height and scroll the body instead of the page.
   * Only from md up: below it the table is hidden anyway and the card list
   * beneath it wants the document's own scroll.
   */
  fill?: boolean;
  className?: string;
}

export function DataTableShell({
  toolbar,
  children,
  fill = false,
  className = '',
}: DataTableShellProps) {
  return (
    <div
      data-testid="data-table-shell"
      // Below md the body is a list of cards that already carry their own
      // rounding and border, so the shell keeps only its role as a container and
      // drops its chrome — otherwise it draws a box around a box. From md up the
      // table fills it and the box is the table's own frame.
      className={`overflow-hidden rounded-card border border-line bg-surface max-md:rounded-none max-md:border-0 max-md:bg-transparent ${
        fill ? 'md:flex md:min-h-0 md:flex-1 md:flex-col' : ''
      } ${className}`}
    >
      {toolbar}
      <div
        data-testid="data-table-shell-body"
        className={`max-md:mt-3 ${fill ? 'md:min-h-0 md:flex-1 md:overflow-y-auto' : ''}`}
      >
        {children}
      </div>
    </div>
  );
}
