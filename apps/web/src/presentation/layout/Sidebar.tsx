import { memo, useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ADMIN_NAV_ITEM, NAV_TABS, type NavDestination } from './nav-tabs';
import { routes } from '@/presentation/lib/routes';
import {
  readStoredCollapsed,
  writeStoredCollapsed,
} from '@/presentation/lib/sidebar-collapsed-storage';

function Destination({
  destination: { label, icon: Icon, route },
  collapsed,
}: {
  destination: NavDestination;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={route}
      aria-label={label}
      title={label}
      className={({ isActive }) =>
        `flex min-h-11 items-center justify-center gap-3 rounded-control px-3 py-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
          collapsed ? '' : 'lg:justify-start'
        } ${isActive ? 'bg-surface-brand text-brand' : 'text-muted hover:bg-canvas hover:text-brand'}`
      }
    >
      <Icon size={22} />
      <span className={`hidden font-sans text-[14px] font-semibold ${collapsed ? '' : 'lg:block'}`}>
        {label}
      </span>
    </NavLink>
  );
}

export const Sidebar = memo(function Sidebar() {
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    writeStoredCollapsed(collapsed);
  }, [collapsed]);

  return (
    <aside
      data-testid="sidebar"
      className={`hidden flex-none flex-col border-r border-surface-brand bg-surface transition-[width] duration-200 md:sticky md:top-0 md:flex md:h-dvh md:w-19 ${
        collapsed ? '' : 'lg:w-55'
      }`}
    >
      <div
        data-testid="sidebar-header"
        className={`flex flex-col items-center gap-2 border-b border-surface-brand px-2 py-2.5 md:min-h-app-header ${
          collapsed ? '' : 'lg:flex-row'
        }`}
      >
        <Link
          to={routes.home}
          aria-label="Zelo"
          className={`flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
            collapsed ? '' : 'lg:flex-1'
          }`}
        >
          <div className="mx-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-icon bg-brand-fill">
            {logoFailed ? (
              <span aria-hidden="true" className="font-serif text-[22px] leading-none text-on-fill">
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
            className={`font-serif text-[28px] leading-none text-ink ${
              collapsed ? 'hidden' : 'hidden lg:block lg:flex-1 lg:text-center'
            }`}
          >
            Zelo
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          aria-pressed={collapsed}
          className="hidden min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-control text-muted transition-colors duration-150 hover:bg-canvas hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:flex"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav
        aria-label="Navegação principal"
        className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-6"
      >
        {NAV_TABS.map((tab) => (
          <Destination key={tab.id} destination={tab} collapsed={collapsed} />
        ))}
      </nav>

      <div
        data-testid="sidebar-admin-section"
        className="flex flex-none flex-col border-t border-surface-brand px-2 py-4"
      >
        <Destination destination={ADMIN_NAV_ITEM} collapsed={collapsed} />
      </div>
    </aside>
  );
});
