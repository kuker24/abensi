import { describe, expect, it } from 'vitest';
import { ROUTES, canAccessRoute, navItemsForUser, routeCrumbs, type AppRoutePath } from './SchoolHubApp';
import type { User } from './types';

const routePaths = new Set<AppRoutePath>(ROUTES.map((route) => route.path));

function user(role: User['role']): User {
  return { id: `${role}-id`, username: String(role).toLowerCase(), fullName: String(role), role } as User;
}

describe('typed route registry', () => {
  it('has unique paths and complete route metadata', () => {
    expect(routePaths.size).toBe(ROUTES.length);
    for (const route of ROUTES) {
      expect(route.path).toMatch(/^\//);
      expect(route.area).toBeTruthy();
      expect(route.title).toBeTruthy();
      expect(route.roles.length).toBeGreaterThan(0);
      expect(route.capabilities.length).toBeGreaterThan(0);
      expect(route.render).toEqual(expect.any(Function));
      expect(routeCrumbs(route.path)).toEqual([route.area, route.title]);
    }
  });

  it('drives navigation from the same route guard metadata', () => {
    for (const role of ['ADMIN_TU', 'OPERATOR_IT', 'GURU_PIKET', 'GURU_MAPEL', 'SISWA', 'DEVELOPER'] as const) {
      const currentUser = user(role);
      const nav = navItemsForUser(currentUser);
      expect(nav.length).toBeGreaterThan(0);
      for (const [, path] of nav) {
        expect(routePaths.has(path)).toBe(true);
        expect(canAccessRoute(path, currentUser)).toBe(true);
      }
    }
  });

  it('keeps protected routes out of unauthorized role navigation', () => {
    expect(canAccessRoute('/admin/developer-control', user('ADMIN_TU'))).toBe(false);
    expect(canAccessRoute('/admin/reports', user('SISWA'))).toBe(false);
    expect(canAccessRoute('/siswa/dashboard', user('SISWA'))).toBe(true);
    expect(canAccessRoute('/guru/presensi', user('GURU_MAPEL'))).toBe(true);
  });

  it('returns a safe crumb fallback for unknown paths', () => {
    expect(routeCrumbs('/unknown')).toEqual(['e-Hadir']);
    expect(canAccessRoute('/unknown', user('DEVELOPER'))).toBe(false);
  });
});
