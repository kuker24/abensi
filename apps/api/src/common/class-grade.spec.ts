import { classGradeBand, isGradeXClassCode, isXiOrXiiClassCode } from './class-grade';

describe('class-grade helpers', () => {
  it('detects XI/XII and not X', () => {
    expect(isXiOrXiiClassCode('XII B')).toBe(true);
    expect(isXiOrXiiClassCode('XI A')).toBe(true);
    expect(isXiOrXiiClassCode('XI-1')).toBe(true);
    expect(isXiOrXiiClassCode('X A')).toBe(false);
    expect(isXiOrXiiClassCode('X-1')).toBe(false);
    expect(isXiOrXiiClassCode('')).toBe(false);
    expect(isXiOrXiiClassCode(null)).toBe(false);
  });

  it('detects grade X only', () => {
    expect(isGradeXClassCode('X A')).toBe(true);
    expect(isGradeXClassCode('X-1')).toBe(true);
    expect(isGradeXClassCode('XI A')).toBe(false);
    expect(isGradeXClassCode('XII B')).toBe(false);
  });

  it('bands codes', () => {
    expect(classGradeBand('X A')).toBe('X');
    expect(classGradeBand('XI C')).toBe('XI');
    expect(classGradeBand('XII B')).toBe('XII');
    expect(classGradeBand('PG')).toBe('OTHER');
  });
});
