import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { AppHeader } from './AppHeader';
import type { AppHeaderOverride } from './app-header-meta';

interface PhoneShellProps {
  children: ReactNode;
  bleed?: boolean;
  footer?: ReactNode;
  bg?: 'canvas' | 'canvas-alt' | 'surface';
  // Renders a persistent Sidebar to the left from 768px up, and hides `footer`
  // from 768px up (the Sidebar replaces it). Only the 4 médico destination
  // pages pass this — see nav-tabs.ts and
  // docs/superpowers/specs/2026-07-28-responsive-tablet-desktop-ui-design.md §3.
  nav?: boolean;
  // Constrains content to a ~680px centered reading column from 768px up.
  // Independent of `nav` — focused-flow pages (assessment in progress,
  // crisis, consent, etc.) set this without `nav`. See design spec §4.
  centered?: boolean;
  // Exact viewport height instead of a minimum, with scrolling handed to the
  // page. For surfaces that own an internal scroll region and must keep their
  // own chrome pinned (chat). Every other page keeps the min-height default.
  fill?: boolean;
  // Title, subtitle or back handler the route table cannot express on its own
  // — the greeting on Home, the two link steps, the assessment's per-question
  // back. See app-header-meta.ts.
  headerOverride?: AppHeaderOverride;
  // Inner column for the header row, when it must not follow `centered` — the
  // chat measures its header against the 900px transcript column instead.
  headerColumn?: string;
}

const BG_CLASS: Record<NonNullable<PhoneShellProps['bg']>, string> = {
  canvas: 'bg-canvas',
  'canvas-alt': 'bg-canvas-alt',
  surface: 'bg-surface',
};

export function PhoneShell({
  children,
  bleed = false,
  footer,
  bg = 'canvas',
  nav = false,
  centered = false,
  fill = false,
  headerOverride,
  headerColumn,
}: PhoneShellProps) {
  const column = (
    <div
      data-testid="phone-shell-root"
      className={`flex ${fill ? 'h-dvh' : 'h-full min-h-dvh'} ${
        nav ? 'min-w-0 flex-1' : ''
      } flex-col ${BG_CLASS[bg]}`}
    >
      <AppHeader
        className={fill ? 'flex-none' : 'sticky top-0 z-30'}
        override={headerOverride}
        column={headerColumn ?? (centered ? 'md:mx-auto md:max-w-170' : '')}
      />
      <main
        data-testid="phone-shell-body"
        className={`no-scrollbar ${
          fill ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'flex-1 overflow-y-auto pt-6'
        } ${bleed ? '' : 'px-6'} ${centered ? 'md:mx-auto md:w-full md:max-w-170' : ''}`}
      >
        {children}
      </main>
      {footer && <div className={`flex-none ${nav ? 'md:hidden' : ''}`}>{footer}</div>}
    </div>
  );

  if (!nav) {
    return column;
  }

  return (
    <div className={`flex ${fill ? 'h-dvh overflow-hidden' : 'min-h-dvh'}`}>
      <Sidebar />
      {column}
    </div>
  );
}
