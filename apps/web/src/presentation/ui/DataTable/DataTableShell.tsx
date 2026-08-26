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
      className={`overflow-hidden rounded-card border border-line bg-surface ${
        fill ? 'md:flex md:min-h-0 md:flex-1 md:flex-col' : ''
      } ${className}`}
    >
      {toolbar}
      <div
        data-testid="data-table-shell-body"
        className={fill ? 'md:min-h-0 md:flex-1 md:overflow-y-auto' : ''}
      >
        {children}
      </div>
    </div>
  );
}
