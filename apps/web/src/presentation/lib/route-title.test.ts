import { describe, expect, it } from 'vitest';
import type { RouteObject } from 'react-router';
import { routeChildren } from '@/app/router';
import { routes } from '@/presentation/lib/routes';
import { ROUTE_TITLES, titleForPathname } from './route-title';

function flatten(children: RouteObject[]): string[] {
  return children.flatMap((route) => [
    ...(route.path ? [route.path.startsWith('/') ? route.path : `/${route.path}`] : []),
    ...(route.children ? flatten(route.children) : []),
  ]);
}

const ROUTE_PATHS = flatten(routeChildren);

describe('titleForPathname', () => {
  it('names the tab after the current page, not the app', () => {
    expect(titleForPathname(routes.you)).toBe('Você · Zelo');
  });

  it('ignores a trailing slash', () => {
    expect(titleForPathname(`${routes.you}/`)).toBe('Você · Zelo');
  });

  it('falls back to the app name for the splash screen and anything unmapped', () => {
    expect(titleForPathname(routes.splash)).toBe('Zelo');
    expect(titleForPathname('/nope')).toBe('Zelo');
  });

  // The splash screen has no page of its own to name, the redirect-only
  // /manager/admin never renders, the catch-all fallback's title is whatever
  // it was on the page the broken link came from, and the finish-setup links
  // carry a real token in place of :token — an exact-pathname lookup can
  // never match them — so the plain "Zelo" default suits all four as well as
  // anything.
  const NO_TITLE_NEEDED = [routes.splash, routes.managerAdmin, routes.managerFinishSetup, routes.peerPartnerFinishSetup, '/*'];

  it('covers every route the app actually serves, aside from the ones with nothing to name', () => {
    const uncovered = ROUTE_PATHS.filter(
      (path) => !NO_TITLE_NEEDED.includes(path) && !ROUTE_TITLES[path],
    );
    expect(uncovered).toEqual([]);
  });

  it('has no entry for a path the router does not serve', () => {
    const orphans = Object.keys(ROUTE_TITLES).filter((path) => !ROUTE_PATHS.includes(path));
    expect(orphans).toEqual([]);
  });
});
