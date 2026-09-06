import { useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { NAV_TABS, SECONDARY_NAV_ITEMS } from './nav-tabs';
import { BottomSheetMenu } from './BottomSheetMenu';
import { NAV_SLOT_CLASS, NavSlotLink, navSlotToneClass } from './nav-slot';

export function BottomNav() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const isMoreActive = SECONDARY_NAV_ITEMS.some(
    (item) => pathname === item.route || pathname.startsWith(`${item.route}/`),
  );

  return (
    <nav
      data-testid="bottom-nav"
      aria-label="Navegação principal no celular"
      className="flex items-stretch border-t border-surface-brand bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV_TABS.map(({ id, label, icon, route }) => (
        <NavSlotLink key={id} to={route} label={label} icon={icon} />
      ))}

      <button
        ref={toggleRef}
        type="button"
        aria-label="Mais opções"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-current={isMoreActive ? 'page' : undefined}
        onClick={() => setOpen((previous) => !previous)}
        className={`${NAV_SLOT_CLASS} cursor-pointer ${navSlotToneClass(isMoreActive)}`}
      >
        {open ? <ArrowDown size={22} aria-hidden="true" /> : <ArrowUp size={22} aria-hidden="true" />}
        <span>Mais</span>
      </button>

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
