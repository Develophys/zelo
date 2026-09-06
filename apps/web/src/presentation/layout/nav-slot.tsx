import type { ComponentType, ReactNode } from 'react';
import { NavLink } from 'react-router';

// Shared by the médico's BottomNav and the manager panel's ManagerBottomNav,
// so a slot in one nav can never drift out of sync with the other: same
// height, same top-border active indicator, same active/inactive tone.
export const NAV_SLOT_CLASS =
  'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 border-t-2 px-1 py-nav-y font-sans text-nav font-semibold motion-safe:transition-colors motion-safe:duration-150 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none';

export function navSlotToneClass(isActive: boolean): string {
  return isActive ? 'border-brand text-brand' : 'border-transparent text-muted';
}

interface NavSlotLinkProps {
  to: string;
  end?: boolean;
  label: string;
  icon: ComponentType<{ size?: number }>;
  badge?: ReactNode;
}

export function NavSlotLink({ to, end, label, icon: Icon, badge }: NavSlotLinkProps) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      className={({ isActive }) => `${NAV_SLOT_CLASS} ${navSlotToneClass(isActive)}`}
    >
      <Icon size={22} aria-hidden="true" />
      <span>{label}</span>
      {badge}
    </NavLink>
  );
}
