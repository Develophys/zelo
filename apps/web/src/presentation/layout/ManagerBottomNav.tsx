import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { ChevronUp, LogOut } from 'lucide-react';
import { routes } from '@/presentation/lib/routes';
import { useManagerSessionStore } from '@/stores/manager-session.store';
import { useManagerUnreadCount } from '@/presentation/hooks/useManagerNotifications';
import { ManagerUnreadBadge } from './ManagerUnreadBadge';
import {
  MANAGER_ADMIN_GROUP_LABEL,
  MANAGER_ADMIN_NAV,
  MANAGER_PRIMARY_NAV,
  MANAGER_SETTINGS_NAV,
} from './manager-nav';

const SLOT_CLASS =
  'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 border-t-2 px-1 py-nav-y font-sans text-[11px] font-semibold motion-safe:transition-colors motion-safe:duration-150 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none';

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
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const unread = useManagerUnreadCount();
  const clearSession = useManagerSessionStore((state) => state.clearSession);

  // showModal() puts the sheet in the top layer, which is what traps focus and
  // restores it to the "Mais" button on close — all of it native, no ad-hoc
  // focus bookkeeping to get subtly wrong.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Escape has to reach the sheet, and it only does if focus is inside it.
      dialog.querySelector<HTMLElement>('a, button')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      moreRef.current?.focus();
    }
  }, [open]);

  const closeThen = (action?: () => void) => () => {
    setOpen(false);
    action?.();
  };

  const dismissOnBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) setOpen(false);
  };

  const dismissOnEscape = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') setOpen(false);
  };

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
            <Icon size={22} />
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
          className={`${SLOT_CLASS} cursor-pointer border-transparent text-muted`}
        >
          <ChevronUp
            size={22}
            className={`motion-safe:transition-transform motion-safe:duration-150 ${open ? 'rotate-180' : ''}`}
          />
          <span>Mais</span>
        </button>
      </div>

      <dialog
        ref={dialogRef}
        aria-label="Mais opções do painel"
        onClick={dismissOnBackdrop}
        onKeyDown={dismissOnEscape}
        onClose={() => setOpen(false)}
        className="mt-auto mb-0 w-full max-w-none bg-transparent p-0 backdrop:bg-scrim/50"
      >
        <div className="rounded-t-card border-t border-surface-brand bg-surface p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
          <span aria-hidden="true" className="mx-auto mt-1 mb-3 block h-1 w-10 rounded-pill bg-track" />

          <h2 className="px-3 pb-1 font-mono text-eyebrow text-muted uppercase">
            {MANAGER_ADMIN_GROUP_LABEL}
          </h2>
          {MANAGER_ADMIN_NAV.map(({ id, label, icon: Icon, route }) => (
            <NavLink
              key={id}
              to={route}
              onClick={closeThen()}
              className="flex min-h-11 items-center gap-3 rounded-control px-3 py-nav-y font-sans text-label font-semibold text-ink hover:bg-canvas focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
            >
              <Icon size={20} />
              {label}
            </NavLink>
          ))}

          <div className="mt-2 border-t border-surface-brand pt-2">
            <NavLink
              to={MANAGER_SETTINGS_NAV.route}
              onClick={closeThen()}
              className="flex min-h-11 items-center gap-3 rounded-control px-3 py-nav-y font-sans text-label font-semibold text-ink hover:bg-canvas focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
            >
              <MANAGER_SETTINGS_NAV.icon size={20} />
              {MANAGER_SETTINGS_NAV.label}
            </NavLink>
            <button
              type="button"
              onClick={closeThen(() => {
                clearSession();
                navigate(routes.managerLogin, { replace: true });
              })}
              className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-control px-3 py-nav-y font-sans text-label font-semibold text-danger hover:bg-danger-bg focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
            >
              <LogOut size={20} />
              Sair
            </button>
          </div>
        </div>
      </dialog>
    </nav>
  );
}
