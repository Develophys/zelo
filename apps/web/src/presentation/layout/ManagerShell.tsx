import { Outlet } from 'react-router';
import { useManagerSessionExpiry } from '@/presentation/hooks/useManagerSessionExpiry';
import { AppHeader } from './AppHeader';
import { ManagerSidebar } from './ManagerSidebar';
import { CONTENT_ID, SkipToContentLink } from '@/presentation/ui/SkipToContentLink';
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
  // Declared here rather than per page: the same effect was copied onto three
  // of the six manager pages and missing from the other three, where an
  // expired session rendered a table error offering a retry that could never
  // succeed.
  useManagerSessionExpiry();

  return (
    <div className="flex h-dvh overflow-hidden bg-surface">
      <SkipToContentLink />
      <ManagerSidebar />
      {/* min-w-0 is load-bearing: without it a fixed-layout table's intrinsic
          width overflows this flex child and brings back the horizontal
          scrollbar the redesign exists to remove. */}
      <div className="flex min-w-0 min-h-0 flex-1 flex-col max-md:h-dvh max-md:overflow-hidden">
        <AppHeader className="sticky top-0 z-30" chrome="manager" />
        <main
          id={CONTENT_ID}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-6 pt-6 pb-20 md:pb-8"
        >
          <Outlet />
        </main>
      </div>
      <ManagerBottomNav />
    </div>
  );
}
