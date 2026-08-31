import { NavLink, useNavigate } from 'react-router';
import { LogOut, UserRound } from 'lucide-react';
import { Tooltip } from '@/presentation/ui/Tooltip';
import { SidebarHeader } from './SidebarHeader';
import { routes } from '@/presentation/lib/routes';
import { useManagerPrefsStore } from '@/stores/manager-prefs.store';
import { useManagerSessionStore } from '@/stores/manager-session.store';
import { useManagerUnreadCount } from '@/presentation/hooks/useManagerNotifications';
import { ManagerUnreadBadge } from './ManagerUnreadBadge';
import {
  MANAGER_ADMIN_GROUP_LABEL,
  managerNavFor,
  MANAGER_PRIMARY_NAV,
  MANAGER_SETTINGS_NAV,
  type ManagerNavItem,
} from './manager-nav';

const ROLE_LABEL: Record<string, string> = {
  HOSPITAL_ADMIN: 'Administração do hospital',
  SECTOR_MANAGER: 'Gestão de setor',
};

function Item({
  item,
  collapsed,
  unreadCount = 0,
}: {
  item: ManagerNavItem;
  collapsed: boolean;
  unreadCount?: number;
}) {
  const { label, icon: Icon, route } = item;

  const link = (
    <NavLink
      to={route}
      end={route === routes.manager}
      aria-label={label}
      className={({ isActive }) =>
        `relative flex min-h-11 w-full flex-col items-center justify-center gap-1 rounded-control px-2 py-nav-y motion-safe:transition-[background-color,color] motion-safe:duration-150 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none lg:flex-row lg:gap-3 lg:px-3 ${
          collapsed ? '' : 'lg:justify-start'
        } ${isActive ? 'bg-brand/10 text-brand' : 'text-muted hover:bg-canvas hover:text-brand'}`
      }
    >
      <Icon size={22} />
      {/* Visible from md up. Tablet portrait is exactly 768px, where the rail is
          icons-only and the collapse toggle that would reveal labels is itself
          lg-only — leaving a 450ms long-press per icon as the only way to learn
          what anything is. `collapsed` is an lg-and-up preference, so it does
          not hide the label at the width that cannot toggle it. */}
      <span
        className={`text-center font-sans text-[10px] leading-tight font-semibold lg:text-[14px] ${
          collapsed ? 'lg:sr-only' : ''
        }`}
      >
        {label}
      </span>
      <ManagerUnreadBadge count={unreadCount} asDot={collapsed} />
    </NavLink>
  );

  // A rail with no visible labels is unusable without them on hover or focus.
  return collapsed ? <Tooltip content={label}>{link}</Tooltip> : link;
}

interface ManagerSidebarProps {
  className?: string;
}

export function ManagerSidebar({ className = '' }: ManagerSidebarProps) {
  const navigate = useNavigate();
  const collapsed = useManagerPrefsStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useManagerPrefsStore((state) => state.toggleSidebar);
  const role = useManagerSessionStore((state) => state.role);
  const nav = managerNavFor(role);
  const clearSession = useManagerSessionStore((state) => state.clearSession);
  const unread = useManagerUnreadCount();

  return (
    <aside
      data-testid="manager-sidebar"
      className={[
        'hidden flex-none flex-col border-r border-surface-brand md:sticky md:top-0 md:flex md:h-dvh md:w-19 motion-safe:transition-[width] motion-safe:duration-150',
        collapsed ? '' : 'lg:w-55',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <SidebarHeader
        to={routes.manager}
        collapsed={collapsed}
        onToggle={toggleSidebar}
        testId="manager-sidebar-header"
      />

      <nav
        aria-label="Navegação do painel"
        className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-4"
      >
        <p
          data-testid="manager-sidebar-caption"
          className={`px-3 pb-2 font-mono text-eyebrow text-muted uppercase ${
            collapsed ? 'sr-only' : 'sr-only lg:not-sr-only'
          }`}
        >
          Painel do gestor
        </p>
        {MANAGER_PRIMARY_NAV.map((item) => (
          <Item
            key={item.id}
            item={item}
            collapsed={collapsed}
            unreadCount={item.id === 'notifications' ? unread : 0}
          />
        ))}

        {nav.showAdminGroup && (
          <>
            <h2
              className={`mt-4 px-3 pb-1 font-mono text-eyebrow text-muted uppercase ${
                collapsed ? 'sr-only' : 'sr-only lg:not-sr-only'
              }`}
            >
              {MANAGER_ADMIN_GROUP_LABEL}
            </h2>
            {nav.admin.map((item) => (
              <Item key={item.id} item={item} collapsed={collapsed} />
            ))}
          </>
        )}
      </nav>

      <div className="flex flex-none flex-col gap-1 border-t border-surface-brand px-2 py-3">
        <div
          className={`flex min-h-11 items-center gap-3 px-3 ${collapsed ? 'justify-center' : 'justify-center lg:justify-start'}`}
        >
          <Tooltip content={role ? ROLE_LABEL[role] : 'Sessão do gestor'}>
            <span
              aria-hidden="true"
              data-testid="manager-account"
              className="flex h-8 w-8 flex-none items-center justify-center rounded-pill bg-surface-brand text-brand"
            >
              <UserRound size={18} />
            </span>
          </Tooltip>
          <span
            className={`font-sans text-caption font-semibold text-muted ${
              collapsed ? 'sr-only' : 'sr-only lg:not-sr-only'
            }`}
          >
            {role ? ROLE_LABEL[role] : 'Sessão do gestor'}
          </span>
        </div>

        <Item item={MANAGER_SETTINGS_NAV} collapsed={collapsed} />

        <SignOut
          collapsed={collapsed}
          onSignOut={() => {
            clearSession();
            navigate(routes.managerLogin, { replace: true });
          }}
        />
      </div>
    </aside>
  );
}

function SignOut({ collapsed, onSignOut }: { collapsed: boolean; onSignOut: () => void }) {
  const button = (
    <button
      type="button"
      onClick={onSignOut}
      aria-label="Sair"
      className={`flex min-h-11 w-full cursor-pointer items-center justify-center gap-3 rounded-control px-3 py-nav-y text-muted motion-safe:transition-colors motion-safe:duration-150 hover:bg-danger-bg hover:text-danger focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none ${
        collapsed ? '' : 'lg:justify-start'
      }`}
    >
      <LogOut size={22} />
      <span
        className={`font-sans text-[14px] font-semibold ${collapsed ? 'sr-only' : 'sr-only lg:not-sr-only'}`}
      >
        Sair
      </span>
    </button>
  );

  return collapsed ? <Tooltip content="Sair">{button}</Tooltip> : button;
}
