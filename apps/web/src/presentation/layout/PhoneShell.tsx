import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { AppHeader, type AppHeaderBack } from './AppHeader';
import { CONTENT_ID, SkipToContentLink } from '@/presentation/ui/SkipToContentLink';
import type { AppHeaderOverride } from './app-header-meta';

interface PhoneShellProps {
  children: ReactNode;
  bleed?: boolean;
  bg?: 'canvas' | 'canvas-alt' | 'surface';
  // Persistent Sidebar to the left from 768px up. Focused flows leave it off:
  // see docs/superpowers/specs/2026-07-28-responsive-tablet-desktop-ui-design.md §3.
  sidebar?: boolean;
  // Persistent BottomNav below 768px. Off only where the page owns the bottom
  // edge itself — the chat composer. `true` mounts the shared médico BottomNav;
  // a node renders in its place instead, for a persona that has its own (the
  // peer-partner nav is two items, not the médico's five).
  bottomNav?: boolean | ReactNode;
  // Constrains content to a ~680px centered reading column from 768px up.
  centered?: boolean;
  // Exact viewport height instead of a minimum, with scrolling handed to the
  // page. For surfaces that own an internal scroll region and must keep their
  // own chrome pinned (chat).
  fill?: boolean;
  headerOverride?: AppHeaderOverride;
  headerColumn?: string;
  // Where the header's back button goes. See AppHeader's own doc comment —
  // the médico-home default is wrong once chrome isn't 'doctor'.
  backTo?: string;
  // 'manager' drops the anonymity badge — for a chrome shown to someone who
  // isn't the anonymous party themselves (a peer partner, a manager).
  chrome?: 'doctor' | 'manager';
}

const BG_CLASS: Record<NonNullable<PhoneShellProps['bg']>, string> = {
  canvas: 'bg-canvas',
  'canvas-alt': 'bg-canvas-alt',
  surface: 'bg-surface',
};

/**
 * The header's back button is an escape hatch, not a step backwards: it shows
 * exactly at the widths where this shell renders no nav at all. Without it a
 * screen with neither sidebar nor bottom nav would be a dead end, since no
 * page carries its own back control any more.
 */
function backFor(sidebar: boolean, bottomNav: boolean): AppHeaderBack | undefined {
  if (!sidebar && !bottomNav) return 'always';
  if (!bottomNav) return 'below-md';
  if (!sidebar) return 'from-md';
  return undefined;
}

export function PhoneShell({
  children,
  bleed = false,
  bg = 'canvas',
  sidebar = false,
  bottomNav = false,
  centered = false,
  fill = false,
  headerOverride,
  headerColumn,
  backTo,
  chrome = 'doctor',
}: PhoneShellProps) {
  // Below md, a page with its own bottom nav should behave like a native app:
  // the nav stays put and only the body scrolls, rather than the document
  // growing past the viewport and carrying the nav off-screen with it.
  // Desktop is untouched — the sidebar already stays pinned via its own
  // sticky position, regardless of how tall the page grows.
  const hasBottomNav = Boolean(bottomNav);
  const lockMobileHeight = hasBottomNav && !fill;

  const column = (
    <div
      data-testid="phone-shell-root"
      className={`flex ${
        fill
          ? 'h-dvh'
          : lockMobileHeight
            ? 'max-md:h-dvh max-md:overflow-hidden md:h-full md:min-h-dvh'
            : 'h-full min-h-dvh'
      } ${sidebar ? 'min-w-0 flex-1' : ''} flex-col ${BG_CLASS[bg]}`}
    >
      <AppHeader
        className={fill ? 'flex-none' : 'sticky top-0 z-30'}
        override={headerOverride}
        column={headerColumn ?? (centered ? 'md:mx-auto md:max-w-170' : '')}
        back={backFor(sidebar, hasBottomNav)}
        backTo={backTo}
        chrome={chrome}
      />
      <main
        id={CONTENT_ID}
        data-testid="phone-shell-body"
        className={`max-md:no-scrollbar ${
          fill ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'flex-1 overflow-y-auto pt-6 pb-6'
        } ${bleed ? '' : 'px-6'} ${centered ? 'md:mx-auto md:w-full md:max-w-170' : ''}`}
      >
        {children}
      </main>
      {bottomNav === true ? <BottomNav /> : bottomNav}
    </div>
  );

  // First in the DOM in both branches, so it is the first tab stop even when a
  // sidebar renders ahead of the column.
  if (!sidebar) {
    return (
      <>
        <SkipToContentLink />
        {column}
      </>
    );
  }

  return (
    <div className={`flex ${fill ? 'h-dvh overflow-hidden' : 'min-h-dvh'}`}>
      <SkipToContentLink />
      <Sidebar />
      {column}
    </div>
  );
}
