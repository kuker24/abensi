import { describe, expect, it } from 'vitest';
import { applyDemoAction, createSeedWorld, isBelajarLabPath, roleFromPath } from './world';

describe('belajar demo world', () => {
  it('approves leave and fans out impacts', () => {
    const seed = createSeedWorld();
    const { world, event } = applyDemoAction(seed, { type: 'APPROVE_LEAVE', actorRole: 'admin-tu' });
    expect(world.leave.status).toBe('APPROVED');
    expect(event?.impacts.map((i) => i.role)).toEqual(expect.arrayContaining(['guru', 'kepala-sekolah', 'guru-piket']));
    expect(world.notifications.guru[0]?.text).toMatch(/disetujui/i);
  });

  it('opens session then marks present for students', () => {
    let world = createSeedWorld();
    world = applyDemoAction(world, { type: 'OPEN_SESSION', actorRole: 'guru' }).world;
    expect(world.session.status).toBe('OPEN');
    const marked = applyDemoAction(world, { type: 'MARK_PRESENT', actorRole: 'guru' });
    expect(marked.world.session.presentCount).toBe(8);
    expect(marked.event?.impacts.some((i) => i.role === 'siswa')).toBe(true);
  });

  it('parses lab paths', () => {
    expect(isBelajarLabPath('/belajar')).toBe(true);
    expect(isBelajarLabPath('/belajar/guru/presensi')).toBe(true);
    expect(isBelajarLabPath('/admin/dashboard')).toBe(false);
    expect(roleFromPath('/belajar/admin-tu/izin')).toBe('admin-tu');
    expect(roleFromPath('/belajar/unknown')).toBeNull();
  });
});
