import { useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { ChevronUp, LogOut } from 'lucide-react';
import { routes } from '@/presentation/lib/routes';
import { useManagerSessionStore } from '@/stores/manager-session.store';
import { useManagerUnreadCount } from '@/presentation/hooks/useManagerNotifications';
import { ManagerUnreadBadge } from './ManagerUnreadBadge';
import { BottomSheetMenu, type BottomSheetMenuGroup } from './BottomSheetMenu';
import {
  MANAGER_ADMIN_GROUP_LABEL,
  managerNavFor,
  MANAGER_PRIMARY_NAV,
  MANAGER_SETTINGS_NAV,
} from './manager-nav';

const SLOT_CLASS =
  'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 border-t-2 px-1 py-nav-y font-sans text-nav font-semibold motion-safe:transition-colors motion-safe:duration-150 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none';

interface ManagerBottomNavProps {
  className?: string;
}

/**
 * Four slots and nothing more, because a fifth would push every tap target
 * under the touch minimum on a 375px screen. Everything that does not fit —
 * the Administração group, Configurações and Sair — lives one tap away in the
 * "Mais" sheet. Sair in particular had no mobile route at all before this.
 */
export function ManagerBottomNav({ className = '' }: ManagerBottomNavProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const unread = useManagerUnreadCount();
  const clearSession = useManagerSessionStore((state) => state.clearSession);
  const role = useManagerSessionStore((state) => state.role);
  const nav = managerNavFor(role);
  const isMoreActive = [...nav.admin.map((item) => item.route), MANAGER_SETTINGS_NAV.route].some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  const groups: BottomSheetMenuGroup[] = [
    { label: nav.showAdminGroup ? MANAGER_ADMIN_GROUP_LABEL : undefined, items: nav.admin },
    {
      items: [
        MANAGER_SETTINGS_NAV,
        {
          id: 'logout',
          label: 'Sair',
          icon: LogOut,
          danger: true,
          onSelect: () => {
            clearSession();
            navigate(routes.managerLogin, { replace: true });
          },
        },
      ],
    },
  ];

  return (
    <nav
      data-testid="manager-bottom-nav"
      aria-label="Navegação do painel no celular"
      className={[
        'fixed inset-x-0 bottom-0 z-30 border-t border-surface-brand bg-surface pb-[env(safe-area-inset-bottom)] md:hidden',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-stretch">
        {MANAGER_PRIMARY_NAV.map(({ id, label, icon: Icon, route }) => (
          <NavLink
            key={id}
            to={route}
            end={route === routes.manager}
            className={({ isActive }) =>
              `${SLOT_CLASS} ${isActive ? 'border-brand text-brand' : 'border-transparent text-muted'}`
            }
          >
            <Icon size={22} aria-hidden="true" />
            <span>{label}</span>
            {id === 'notifications' && <ManagerUnreadBadge count={unread} asDot />}
          </NavLink>
        ))}

        <button
          type="button"
          ref={moreRef}
          onClick={() => setOpen((previous) => !previous)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-current={isMoreActive ? 'page' : undefined}
          className={`${SLOT_CLASS} cursor-pointer ${isMoreActive ? 'border-brand text-brand' : 'border-transparent text-muted'}`}
        >
          <ChevronUp
            size={22}
            className={`motion-safe:transition-transform motion-safe:duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          <span>Mais</span>
        </button>
      </div>

      <BottomSheetMenu
        open={open}
        onClose={() => setOpen(false)}
        returnFocusRef={moreRef}
        ariaLabel="Mais opções do painel"
        groups={groups}
      />
    </nav>
  );
}
