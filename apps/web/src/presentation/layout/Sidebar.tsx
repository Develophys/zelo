import { memo, useEffect, useState } from 'react';
import { NavLink } from 'react-router';
import { NAV_TABS, SECONDARY_NAV_ITEMS, type NavDestination } from './nav-tabs';
import { SidebarHeader } from './SidebarHeader';
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
        `flex min-h-11 flex-col items-center justify-center gap-1 rounded-control px-2 py-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:flex-row lg:gap-3 lg:px-3 ${
          collapsed ? '' : 'lg:justify-start'
        } ${isActive ? 'bg-surface-brand text-brand' : 'text-muted hover:bg-canvas hover:text-brand'}`
      }
    >
      <Icon size={22} />
      {/* Visible from md up, as on ManagerSidebar. Tablet portrait is exactly
          768px, where this rail is icons-only and the collapse toggle that
          would reveal labels is itself lg-only — leaving a slow native title=
          tooltip as the only way to learn what anything is. `collapsed` is an
          lg-and-up preference, so it must not hide the label at the one width
          that cannot toggle it. */}
      <span
        className={`text-center font-sans text-nav-rail leading-tight font-semibold lg:text-label ${
          collapsed ? 'lg:sr-only' : ''
        }`}
      >
        {label}
      </span>
    </NavLink>
  );
}

export const Sidebar = memo(function Sidebar() {
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);

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
      <SidebarHeader
        to={routes.home}
        collapsed={collapsed}
        onToggle={() => setCollapsed((prev) => !prev)}
        testId="sidebar-header"
      />

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
        className="flex flex-none flex-col gap-1 border-t border-surface-brand px-2 py-4"
      >
        {SECONDARY_NAV_ITEMS.map((item) => (
          <Destination key={item.id} destination={item} collapsed={collapsed} />
        ))}
      </div>
    </aside>
  );
});
