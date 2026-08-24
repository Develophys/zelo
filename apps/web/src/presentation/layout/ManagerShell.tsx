import { Outlet } from 'react-router';
import { useApplyManagerPrefs } from '@/presentation/hooks/useApplyManagerPrefs';
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
    <div className="flex min-h-dvh bg-surface">
      <ManagerSidebar />
      {/* min-w-0 is load-bearing: without it a fixed-layout table's intrinsic
          width overflows this flex child and brings back the horizontal
          scrollbar the redesign exists to remove. */}
      <main className="min-w-0 flex-1 px-6 pb-20 md:pb-8">
        <Outlet />
      </main>
      <ManagerBottomNav />
    </div>
  );
}
