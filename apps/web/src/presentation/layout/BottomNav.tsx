import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { NAV_TABS, SECONDARY_NAV_ITEMS } from './nav-tabs';

const SECONDARY_MENU_ID = 'bottom-nav-secondary-menu';

/**
 * The active tab is read from the route rather than passed in: the nav is
 * mounted by the shell on every screen now, and a prop would have to be
 * threaded through pages that know nothing about it. Longest match wins, so
 * /assessment/phq9 lights Check-in and /you/link lights Você.
 */
function activeTabRoute(pathname: string): string | undefined {
  return NAV_TABS.map((tab) => tab.route)
    .filter((route) => pathname === route || pathname.startsWith(`${route}/`))
    .sort((a, b) => b.length - a.length)[0];
}

export function BottomNav() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const secondaryRef = useRef<HTMLDivElement>(null);
  const activeRoute = activeTabRoute(pathname);

  useEffect(() => {
    if (!open) return;

    const closeOnOutside = (event: PointerEvent) => {
      if (!secondaryRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <nav
      data-testid="bottom-nav"
      aria-label="Navegação principal no celular"
      className="flex flex-none justify-around border-t border-surface-brand bg-surface px-2 pb-6 pt-3 md:hidden"
    >
      {NAV_TABS.map(({ id, label, icon: Icon, route }) => {
        const isActive = route === activeRoute;
        return (
          <Link
            key={id}
            to={route}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            className={`flex min-h-11 min-w-11 flex-col items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              isActive ? 'text-brand' : 'text-muted'
            }`}
          >
            <Icon size={22} />
            <span className="font-sans text-[11px] font-semibold">{label}</span>
          </Link>
        );
      })}

      <div
        ref={secondaryRef}
        data-testid="bottom-nav-secondary"
        className="relative flex items-center border-l border-surface-brand pl-2"
      >
        <button
          type="button"
          aria-label="Mais opções"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={SECONDARY_MENU_ID}
          onClick={() => setOpen((previous) => !previous)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-muted transition-colors duration-150 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {open ? <ArrowDown size={22} /> : <ArrowUp size={22} />}
        </button>

        {open && (
          <div
            id={SECONDARY_MENU_ID}
            role="menu"
            className="absolute bottom-full right-0 mb-2 min-w-45 rounded-card border border-surface-brand bg-surface p-1 shadow-card-lg"
          >
            {SECONDARY_NAV_ITEMS.map(({ id, label, icon: Icon, route }) => (
              <Link
                key={id}
                role="menuitem"
                to={route}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center gap-3 rounded-control px-3 py-2 text-muted transition-colors duration-150 hover:bg-canvas hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Icon size={20} />
                <span className="font-sans text-[14px] font-semibold">{label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
