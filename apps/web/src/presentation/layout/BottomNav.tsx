import { NAV_TABS, type NavTabId } from "./nav-tabs";

interface BottomNavProps {
  active: NavTabId;
  onNavigate: (tab: NavTabId) => void;
}

export function BottomNav({ active, onNavigate }: BottomNavProps) {
  return (
    <nav data-testid="bottom-nav" className="flex flex-none justify-around border-t border-surface-brand bg-surface px-2 pb-6 pt-3">
      {NAV_TABS.map(({ id, label, icon: Icon }) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onNavigate(id)}
            className={`flex min-h-[44px] min-w-[44px] flex-col items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              isActive ? "text-brand" : "text-faint"
            }`}
          >
            <Icon size={22} />
            <span className="font-sans text-[11px] font-semibold">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
