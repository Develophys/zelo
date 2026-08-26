import { Outlet } from 'react-router';
import { useApplyManagerPrefs } from '@/presentation/hooks/useApplyManagerPrefs';
import { AppHeader } from './AppHeader';
import { ManagerSidebar } from './ManagerSidebar';
import { ManagerBottomNav } from './ManagerBottomNav';

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
    <div className="flex min-h-dvh bg-surface md:h-dvh md:overflow-hidden">
      <ManagerSidebar />
      {/* min-w-0 is load-bearing: without it a fixed-layout table's intrinsic
          width overflows this flex child and brings back the horizontal
          scrollbar the redesign exists to remove. */}
      <div className="flex min-w-0 min-h-0 flex-1 flex-col">
        <AppHeader className="sticky top-0 z-30" />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col px-6 pt-6 pb-20 md:overflow-y-auto md:pb-8">
          <Outlet />
        </main>
      </div>
      <ManagerBottomNav />
    </div>
  );
}
