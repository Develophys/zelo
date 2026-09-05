import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface SidebarHeaderProps {
  to: string;
  collapsed: boolean;
  onToggle: () => void;
  testId: string;
}

export function SidebarHeader({ to, collapsed, onToggle, testId }: SidebarHeaderProps) {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <div
      data-testid={testId}
      className={`flex flex-col items-center gap-2 border-b border-surface-brand px-2 py-2.5 md:min-h-app-header ${
        collapsed ? '' : 'lg:flex-row'
      }`}
    >
      <Link
        to={to}
        aria-label="Zelo"
        className={`flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
          collapsed ? '' : 'lg:flex-1'
        }`}
      >
        <div className="mx-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-icon bg-brand-fill">
          {logoFailed ? (
            <span aria-hidden="true" className="font-serif text-logo-mark leading-none text-on-fill">
              Z
            </span>
          ) : (
            <picture>
              <source srcSet={`${import.meta.env.BASE_URL}zelo_logo.webp`} type="image/webp" />
              <img
                src={`${import.meta.env.BASE_URL}zelo_logo.png`}
                alt="Zelo Logo"
                width={40}
                height={40}
                onError={() => setLogoFailed(true)}
                className="h-full w-full object-contain"
              />
            </picture>
          )}
        </div>
        <span
          aria-hidden="true"
          className={`font-serif text-h1 leading-none text-ink ${
            collapsed ? 'hidden' : 'hidden lg:block lg:flex-1 lg:text-center'
          }`}
        >
          Zelo
        </span>
      </Link>
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        aria-pressed={collapsed}
        className="hidden min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-control text-muted transition-colors duration-150 hover:bg-canvas hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:flex"
      >
        {collapsed ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronLeft size={18} aria-hidden="true" />}
      </button>
    </div>
  );
}
