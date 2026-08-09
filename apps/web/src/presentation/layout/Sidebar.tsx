import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NAV_TABS } from "./nav-tabs";
import { routes } from "@/presentation/lib/routes";

const COLLAPSED_STORAGE_KEY = "zelo.sidebar-collapsed";

function readStoredCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

// Persistent navigation for tablet/desktop (≥768px) — shown only on the 4
// médico destination pages (Home, Check-in, Conversar, Você), never on
// focused-flow screens (assessment in progress, crisis, consent, etc.), per
// docs/superpowers/specs/2026-07-28-responsive-tablet-desktop-ui-design.md §3.
// Below 768px this renders nothing visible (`hidden md:flex`); BottomNav
// remains the mobile nav, unchanged. From 1024px up, `collapsed` lets the
// médico manually shrink it to the same icon rail used at tablet width — see
// docs/superpowers/specs/2026-08-09-sidebar-collapse-and-brand-header-design.md.
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
    } catch {
      // preference is best-effort
    }
  }, [collapsed]);

  return (
    <aside
      data-testid="sidebar"
      className={`hidden flex-none flex-col border-r border-surface-brand bg-surface transition-[width] duration-200 md:flex md:w-[76px] ${
        collapsed ? "" : "lg:w-[220px]"
      }`}
    >
      <div
        className={`flex flex-col items-center gap-2 border-b border-surface-brand px-2 py-4 ${
          collapsed ? "" : "lg:flex-row lg:justify-between"
        }`}
      >
        <Link
          to={routes.home}
          aria-label="Zelo"
          className="flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <picture>
            <source srcSet={`${import.meta.env.BASE_URL}zelo_logo.webp`} type="image/webp" />
            <img
              src={`${import.meta.env.BASE_URL}zelo_logo.png`}
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 flex-none object-contain"
            />
          </picture>
          <span
            aria-hidden="true"
            className={`font-sans text-[15px] font-bold text-ink ${collapsed ? "hidden" : "hidden lg:inline"}`}
          >
            Zelo
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          aria-pressed={collapsed}
          className="hidden min-h-[44px] min-w-[44px] items-center justify-center rounded-input text-muted hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:flex"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav aria-label="Navegação principal" className="flex flex-1 flex-col gap-1 px-2 py-6">
        {NAV_TABS.map(({ id, label, icon: Icon, route }) => (
          <NavLink
            key={id}
            to={route}
            aria-label={label}
            className={({ isActive }) =>
              `flex min-h-[44px] items-center justify-center gap-3 rounded-input px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                collapsed ? "" : "lg:justify-start"
              } ${isActive ? "bg-surface-brand text-brand" : "text-faint"}`
            }
          >
            <Icon size={22} />
            <span className={`hidden font-sans text-[14px] font-semibold ${collapsed ? "" : "lg:inline"}`}>
              {label}
            </span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
