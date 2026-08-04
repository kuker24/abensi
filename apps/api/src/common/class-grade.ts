/**
 * Grade band helpers for class codes (SchoolClass.code).
 * Policy (active until cards ready): only grade X is mandatory for mapel attendance;
 * XI/XII are frozen (CARD_NOT_READY) — no hard-delete.
 */

export type ClassGradeBand = 'X' | 'XI' | 'XII' | 'OTHER';

/** True for XI / XII class codes (e.g. "XI A", "XII B", "XI-1"). */
export function isXiOrXiiClassCode(code: string | null | undefined): boolean {
  const value = String(code ?? '').trim();
  if (!value) return false;
  return /^XII(\s|$|-)/i.test(value) || /^XI(\s|$|-)/i.test(value);
}

/** True for grade X only (not XI/XII), e.g. "X A", "X-1". */
export function isGradeXClassCode(code: string | null | undefined): boolean {
  const value = String(code ?? '').trim();
  if (!value) return false;
  return /^X(\s|$|-)/i.test(value) && !isXiOrXiiClassCode(value);
}

export function classGradeBand(code: string | null | undefined): ClassGradeBand {
  if (isXiOrXiiClassCode(code)) {
    const value = String(code ?? '').trim();
    return /^XII(\s|$|-)/i.test(value) ? 'XII' : 'XI';
  }
  if (isGradeXClassCode(code)) return 'X';
  return 'OTHER';
}
