import { NavLink } from "react-router";
import { NAV_TABS } from "./nav-tabs";

// Persistent navigation for tablet/desktop (≥768px) — shown only on the 4
// médico destination pages (Home, Check-in, Conversar, Você), never on
// focused-flow screens (assessment in progress, crisis, consent, etc.), per
// docs/superpowers/specs/2026-07-28-responsive-tablet-desktop-ui-design.md §3.
// Below 768px this renders nothing visible (`hidden md:flex`); BottomNav
// remains the mobile nav, unchanged.
export function Sidebar() {
  return (
    <nav
      aria-label="Navegação principal"
      className="hidden flex-none flex-col gap-1 border-r border-surface-brand bg-surface px-2 py-6 md:flex md:w-[76px] lg:w-[220px]"
    >
      {NAV_TABS.map(({ id, label, icon: Icon, route }) => (
        <NavLink
          key={id}
          to={route}
          aria-label={label}
          className={({ isActive }) =>
            `flex min-h-[44px] items-center justify-center gap-3 rounded-input px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:justify-start ${
              isActive ? "bg-surface-brand text-brand" : "text-faint"
            }`
          }
        >
          <Icon size={22} />
          <span className="hidden font-sans text-[14px] font-semibold lg:inline">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
