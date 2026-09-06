import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { NAV_TABS, SECONDARY_NAV_ITEMS } from './nav-tabs';
import { BottomSheetMenu } from './BottomSheetMenu';

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
  const toggleRef = useRef<HTMLButtonElement>(null);
  const activeRoute = activeTabRoute(pathname);
  const isMoreActive = SECONDARY_NAV_ITEMS.some(
    (item) => pathname === item.route || pathname.startsWith(`${item.route}/`),
  );

  return (
    <nav
      data-testid="bottom-nav"
      aria-label="Navegação principal no celular"
      className="flex flex-none justify-around border-t border-surface-brand bg-surface px-2 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] md:hidden"
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
            <Icon size={22} aria-hidden="true" />
            <span className="font-sans text-nav font-semibold">{label}</span>
          </Link>
        );
      })}

      <div
        data-testid="bottom-nav-secondary"
        className="relative flex items-center border-l border-surface-brand pl-2"
      >
        <button
          ref={toggleRef}
          type="button"
          aria-label="Mais opções"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-current={isMoreActive ? 'page' : undefined}
          onClick={() => setOpen((previous) => !previous)}
          className={`flex min-h-11 min-w-11 items-center justify-center rounded-control transition-colors duration-150 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
            isMoreActive ? 'text-brand' : 'text-muted'
          }`}
        >
          {open ? <ArrowDown size={22} aria-hidden="true" /> : <ArrowUp size={22} aria-hidden="true" />}
        </button>
      </div>

      <BottomSheetMenu
        open={open}
        onClose={() => setOpen(false)}
        returnFocusRef={toggleRef}
        ariaLabel="Mais opções"
        groups={[{ items: SECONDARY_NAV_ITEMS }]}
      />
    </nav>
  );
}
