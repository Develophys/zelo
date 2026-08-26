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
  routes.manager,
  routes.managerNotifications,
  routes.managerHistory,
  routes.managerSettings,
  routes.managerAdminManagers,
  routes.managerAdminSectors,
  routes.managerAdminPeers,
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
  routes.peerPartnerInbox,
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

  it('has no param route, which an exact pathname lookup could not resolve', () => {
    expect(ROUTE_PATHS.filter((path) => path.includes(':'))).toEqual([]);
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
  });
});
