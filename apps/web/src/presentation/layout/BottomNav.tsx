import { NAV_TABS, SECONDARY_NAV_ITEMS } from './nav-tabs';
import { NavSlotLink } from './nav-slot';

export function BottomNav() {
  return (
    <nav
      data-testid="bottom-nav"
      aria-label="Navegação principal no celular"
      className="flex items-stretch border-t border-surface-brand bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV_TABS.map(({ id, label, icon, route }) => (
        <NavSlotLink key={id} to={route} label={label} icon={icon} />
      ))}

      {SECONDARY_NAV_ITEMS.map(({ id, label, icon, route }) => (
        <NavSlotLink key={id} to={route} label={label} icon={icon} />
      ))}
    </nav>
  );
}
