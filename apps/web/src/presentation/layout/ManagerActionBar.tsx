import type { ReactNode } from 'react';

interface ManagerActionBarProps {
  children: ReactNode;
  className?: string;
}

/**
 * The page's own actions, ruled off from the header above them and aligned to
 * the content they act on rather than to the far edge of the page.
 */
export function ManagerActionBar({ children, className = '' }: ManagerActionBarProps) {
  return (
    <div data-testid="manager-action-bar" className={className}>
      <hr className="mt-3 border-t border-line" />
      <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
