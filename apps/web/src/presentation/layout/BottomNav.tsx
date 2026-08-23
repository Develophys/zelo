import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { ADMIN_NAV_ITEM, NAV_TABS, type NavTabId } from './nav-tabs';

interface BottomNavProps {
  active: NavTabId;
  onNavigate: (tab: NavTabId) => void;
}

const SECONDARY_MENU_ID = 'bottom-nav-secondary-menu';

export function BottomNav({ active, onNavigate }: BottomNavProps) {
  const [open, setOpen] = useState(false);
  const secondaryRef = useRef<HTMLDivElement>(null);
  const AdminIcon = ADMIN_NAV_ITEM.icon;

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
      className="flex flex-none justify-around border-t border-surface-brand bg-surface px-2 pb-6 pt-3"
    >
      {NAV_TABS.map(({ id, label, icon: Icon }) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onNavigate(id)}
            className={`flex min-h-11 min-w-11 flex-col items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              isActive ? 'text-brand' : 'text-muted'
            }`}
          >
            <Icon size={22} />
            <span className="font-sans text-[11px] font-semibold">{label}</span>
          </button>
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
          className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {open ? <ArrowDown size={22} /> : <ArrowUp size={22} />}
        </button>

        {open && (
          <div
            id={SECONDARY_MENU_ID}
            role="menu"
            className="absolute bottom-full right-0 mb-2 min-w-45 rounded-card border border-surface-brand bg-surface p-1 shadow-card-lg"
          >
            <Link
              role="menuitem"
              to={ADMIN_NAV_ITEM.route}
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center gap-3 rounded-input px-3 py-2 text-muted transition-colors duration-150 hover:bg-canvas hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <AdminIcon size={20} />
              <span className="font-sans text-[14px] font-semibold">{ADMIN_NAV_ITEM.label}</span>
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
