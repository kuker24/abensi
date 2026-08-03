import { describe, expect, it } from 'vitest';
import { DEMO_ROLES, type DemoRole } from './world';
import { LEARNING_PATH, coachStepsForRole, missionTitleForRole } from './copy';

describe('belajar mission content', () => {
  it('jalur belajar mencakup keenam peran berurutan', () => {
    expect(LEARNING_PATH).toHaveLength(6);
    expect(LEARNING_PATH.map((item) => item.role)).toEqual([
      'admin-tu',
      'guru',
      'siswa',
      'guru-piket',
      'operator-it',
      'kepala-sekolah'
    ]);
  });

  it.each(DEMO_ROLES.map((role) => role.id))('peran %s punya minimal 6 langkah dan naskah suara', (role: DemoRole) => {
    const steps = coachStepsForRole(role);
    expect(steps.length).toBeGreaterThanOrEqual(6);
    expect(steps.every((step) => step.voice.trim().length > 20)).toBe(true);
    expect(steps[steps.length - 1]?.completeMission).toBe(true);
    expect(missionTitleForRole(role).length).toBeGreaterThan(3);
  });

  it('peran utama punya langkah aksi wajib', () => {
    const admin = coachStepsForRole('admin-tu');
    const guru = coachStepsForRole('guru');
    const operator = coachStepsForRole('operator-it');
    expect(admin.some((s) => s.waitForAction === 'APPROVE_LEAVE')).toBe(true);
    expect(guru.some((s) => s.waitForAction === 'OPEN_SESSION')).toBe(true);
    expect(guru.some((s) => s.waitForAction === 'MARK_PRESENT')).toBe(true);
    expect(operator.some((s) => Array.isArray(s.waitForAction) && s.waitForAction.includes('SET_READER_ONLINE'))).toBe(true);
  });
});
