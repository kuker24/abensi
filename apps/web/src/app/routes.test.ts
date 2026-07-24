import { describe, expect, it } from 'vitest';
import { BRAND } from './branding';
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
    for (const role of ['ADMIN_TU', 'KEPALA_SEKOLAH', 'OPERATOR_IT', 'GURU_PIKET', 'GURU_MAPEL', 'SISWA', 'DEVELOPER'] as const) {
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
    expect(canAccessRoute('/admin/reports', user('KEPALA_SEKOLAH'))).toBe(true);
    expect(canAccessRoute('/admin/master-data', user('KEPALA_SEKOLAH'))).toBe(false);
    expect(canAccessRoute('/admin/master-data/id-card-generator', user('ADMIN_TU'))).toBe(true);
    expect(canAccessRoute('/admin/master-data/id-card-generator', user('OPERATOR_IT'))).toBe(true);
    expect(canAccessRoute('/admin/master-data/id-card-generator', user('DEVELOPER'))).toBe(true);
    expect(canAccessRoute('/admin/master-data/id-card-generator', user('SISWA'))).toBe(false);
    expect(canAccessRoute('/admin/android-apk-update', user('ADMIN_TU'))).toBe(true);
    expect(canAccessRoute('/admin/android-apk-update', user('OPERATOR_IT'))).toBe(true);
    expect(canAccessRoute('/admin/android-apk-update', user('SISWA'))).toBe(false);
    expect(canAccessRoute('/admin/account-security', user('ADMIN_TU'))).toBe(true);
    expect(canAccessRoute('/admin/account-security', user('DEVELOPER'))).toBe(true);
    expect(canAccessRoute('/admin/account-security', user('OPERATOR_IT'))).toBe(false);
    expect(canAccessRoute('/admin/account-security', user('SISWA'))).toBe(false);
    expect(canAccessRoute('/siswa/dashboard', user('SISWA'))).toBe(true);
    expect(canAccessRoute('/guru/presensi', user('GURU_MAPEL'))).toBe(true);
  });

  it('enforces personnel leave self-service and reviewer access', () => {
    const selfRoutes = {
      ADMIN_TU: '/admin/izin-saya',
      KEPALA_SEKOLAH: '/admin/izin-saya',
      GURU_MAPEL: '/guru/izin',
      GURU_PIKET: '/admin/izin-saya',
      OPERATOR_IT: '/admin/izin-saya'
    } as const;

    for (const [role, path] of Object.entries(selfRoutes)) {
      const currentUser = user(role as User['role']);
      expect(canAccessRoute(path, currentUser)).toBe(true);
      expect(navItemsForUser(currentUser).map(([, url]) => url)).toContain(path);
    }

    for (const role of ['SISWA', 'DEVELOPER'] as const) {
      const currentUser = user(role);
      expect(canAccessRoute('/admin/izin-saya', currentUser)).toBe(false);
      expect(canAccessRoute('/guru/izin', currentUser)).toBe(false);
      expect(canAccessRoute('/admin/izin-personel', currentUser)).toBe(false);
      expect(navItemsForUser(currentUser).map(([, url]) => url)).not.toContain('/admin/izin-saya');
    }

    expect(canAccessRoute('/admin/izin-personel', user('ADMIN_TU'))).toBe(true);
    expect(canAccessRoute('/admin/izin-personel', user('KEPALA_SEKOLAH'))).toBe(true);
    expect(canAccessRoute('/admin/izin-personel', user('OPERATOR_IT'))).toBe(false);
    expect(navItemsForUser(user('ADMIN_TU')).map(([, url]) => url)).toContain('/admin/izin-personel');
    expect(navItemsForUser(user('KEPALA_SEKOLAH')).map(([, url]) => url)).toContain('/admin/izin-personel');
  });

  it('returns a safe crumb fallback for unknown paths', () => {
    expect(routeCrumbs('/unknown')).toEqual([BRAND.compactName]);
    expect(canAccessRoute('/unknown', user('DEVELOPER'))).toBe(false);
  });
});
