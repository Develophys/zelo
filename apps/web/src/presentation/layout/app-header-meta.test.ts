import type { RouteObject } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routeChildren } from '@/app/router';
import { routes } from '@/presentation/lib/routes';
import { APP_HEADER_META, resolveAppHeaderMeta } from './app-header-meta';

function flatten(children: RouteObject[]): string[] {
  return children.flatMap((route) => [
    ...(route.path ? [route.path.startsWith('/') ? route.path : `/${route.path}`] : []),
    ...(route.children ? flatten(route.children) : []),
  ]);
}

const ROUTE_PATHS = flatten(routeChildren);

const IN_SCOPE = [
  routes.home,
  routes.chat,
  routes.assessment,
  routes.phq9,
  routes.gad7,
  routes.result,
  routes.crisis,
  routes.crisisConnect,
  routes.crisisLine,
  routes.peers,
  routes.you,
  routes.linkInstitution,
  routes.settings,
  routes.manager,
  routes.managerNotifications,
  routes.managerHistory,
  routes.managerSettings,
  routes.managerAdminManagers,
  routes.managerAdminSectors,
  routes.managerAdminPeers,
  routes.peerPartnerInbox,
  routes.peerPartnerSettings,
];

const OUT_OF_SCOPE = [
  routes.splash,
  routes.privacy,
  routes.consent,
  routes.managerLogin,
  routes.managerFinishSetup,
  routes.adminLogin,
  routes.admin,
  routes.peerPartnerLogin,
  routes.peerPartnerFinishSetup,
];

describe('APP_HEADER_META', () => {
  it('covers every in-scope route with a non-empty title', () => {
    const missing = IN_SCOPE.filter((path) => !APP_HEADER_META[path]?.title);
    expect(missing).toEqual([]);
  });

  it('leaves onboarding, login and the other personas without a header', () => {
    const unexpected = OUT_OF_SCOPE.filter((path) => APP_HEADER_META[path]);
    expect(unexpected).toEqual([]);
  });

  it('has no entry for a path the router does not serve', () => {
    const orphans = Object.keys(APP_HEADER_META).filter((path) => !ROUTE_PATHS.includes(path));
    expect(orphans).toEqual([]);
  });

  it('has no in-scope param route, which an exact pathname lookup could not resolve', () => {
    // The two finish-setup links carry a real token in place of :token and are
    // already out of scope above — no header ever needs to resolve for them.
    const paramRoutes = ROUTE_PATHS.filter((path) => path.includes(':'));
    expect(paramRoutes).toEqual([routes.managerFinishSetup, routes.peerPartnerFinishSetup]);
  });

  /**
   * The header's title column at 360px, after `px-4`, the back button, two
   * `gap-3`s, the theme switch and the privacy badge, is 197px. The subtitle
   * wraps to two lines and `line-clamp-2` cuts the third, so the copy has to
   * fit — a `title` tooltip is not an escape hatch on a phone. Longer
   * explanations belong in the page body, where the decision is made.
   */
  const HEADER_COLUMN_PX = 360 - (32 + 44 + 12 + 12 + 44 + 19);
  const SUBTITLE_PX = 13;
  const SANS_ADVANCE = 0.55;
  const WRAP_PACKING = 0.9;
  const TWO_LINE_BUDGET = Math.floor(
    ((HEADER_COLUMN_PX / (SUBTITLE_PX * SANS_ADVANCE)) * 2) * WRAP_PACKING,
  );

  it('states every subtitle in the two lines a 360px phone leaves, so none is clamped away', () => {
    const clamped = Object.entries(APP_HEADER_META)
      .filter(([, meta]) => (meta.subtitle?.length ?? 0) > TWO_LINE_BUDGET)
      .map(([path, meta]) => `${path}: ${meta.subtitle!.length} > ${TWO_LINE_BUDGET}`);

    expect(clamped).toEqual([]);
  });
});

describe('resolveAppHeaderMeta', () => {
  it('resolves a known pathname', () => {
    expect(resolveAppHeaderMeta(routes.you)?.title).toBe('Você');
  });

  it('ignores a trailing slash', () => {
    expect(resolveAppHeaderMeta(`${routes.you}/`)?.title).toBe('Você');
  });

  it('returns null for a pathname with no header', () => {
    expect(resolveAppHeaderMeta(routes.splash)).toBeNull();
    expect(resolveAppHeaderMeta('/nope')).toBeNull();
  });});
