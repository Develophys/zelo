import { useState } from 'react';
import { Link, Outlet } from 'react-router';
import { ThemeSwitchButton } from '@/presentation/ui/ThemeSwitchButton';
import { useApplyManagerPrefs } from '@/presentation/hooks/useApplyManagerPrefs';
import { ManagerSidebar } from './ManagerSidebar';
import { ManagerBottomNav } from './ManagerBottomNav';
import { routes } from '@/presentation/lib/routes';

function ManagerTopBar() {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex min-h-app-header items-center justify-between gap-3 border-b border-surface-brand bg-surface px-4 md:px-6 lg:px-8">
      <Link
        to={routes.manager}
        aria-label="Zelo — painel do gestor"
        className="flex min-h-11 items-center gap-2 rounded-control focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
      >
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-icon bg-brand-fill">
          {logoFailed ? (
            <span aria-hidden="true" className="font-serif text-[20px] leading-none text-on-fill">
              Z
            </span>
          ) : (
            <picture>
              <source srcSet={`${import.meta.env.BASE_URL}zelo_logo.webp`} type="image/webp" />
              <img
                src={`${import.meta.env.BASE_URL}zelo_logo.png`}
                alt=""
                width={36}
                height={36}
                onError={() => setLogoFailed(true)}
                className="h-full w-full object-contain"
              />
            </picture>
          )}
        </span>
        <span aria-hidden="true" className="font-serif text-[22px] leading-none text-ink">
          Zelo
        </span>
      </Link>
      <ThemeSwitchButton />
    </header>
  );
}

/**
 * One shell for every viewport. The breakpoints are the only thing that changes
 * between phone, tablet and desktop — there is no second tree to swap in, so
 * search terms, selections and in-flight infinite queries survive a resize
 * instead of being unmounted and refetched at the boundary.
 *
 * The two nav components below own their own geometry; what lives here is the
 * clearance measured against it.
 */
export function ManagerShell() {
  useApplyManagerPrefs();

  return (
    <div className="min-h-dvh bg-surface">
      <ManagerTopBar />
      <div className="mx-auto flex w-full max-w-295 gap-0 px-4 md:px-6 lg:px-8">
        <ManagerSidebar />
        {/* min-w-0 is load-bearing: without it a fixed-layout table's intrinsic
            width overflows this flex child and brings back the horizontal
            scrollbar the redesign exists to remove. */}
        <main className="min-w-0 flex-1 pb-20 md:pb-8">
          <Outlet />
        </main>
      </div>
      <ManagerBottomNav />
    </div>
  );
}
