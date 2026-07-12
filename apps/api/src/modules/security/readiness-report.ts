export type ReadinessSeverity = 'INFO' | 'WARNING' | 'BLOCKING';

export type SanitizedReadinessDetail = {
  category?: string;
  scope?: string;
  businessDate?: string;
  count?: number;
  groupCount?: number;
  eventCount?: number;
  present?: number;
  required?: number;
  status?: string;
  trustedThroughSequence?: string | null;
  historicalUntrustedRange?: { from: string; to: string } | null;
  activeEpoch?: number | null;
  historicalFindings?: number;
  issueCodes?: string[];
  code?: string;
};

export type SanitizedReadinessCheck = {
  name: string;
  severity: ReadinessSeverity;
  count: number;
  details: SanitizedReadinessDetail[];
};

export type SanitizedReadinessReport = {
  generatedAt: string;
  ok: boolean;
  blockingCount: number;
  checks: SanitizedReadinessCheck[];
};

const MAX_DETAILS = 100;
const SAFE_CHECK_NAME = /^[a-z0-9_]{1,100}$/;
const SAFE_CATEGORY = /^[A-Za-z0-9_-]{1,100}$/;
const SAFE_STATUS = /^[A-Z0-9_]{1,100}$/;
const SAFE_CODE = /^[A-Z0-9_]{1,100}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SEQUENCE = /^\d+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return undefined;
  return value;
}

function safeCode(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_CODE.test(value) ? value : undefined;
}

function safeCategory(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_CATEGORY.test(value) ? value : undefined;
}

function safeStatus(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_STATUS.test(value) ? value : undefined;
}

function safeSequence(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string' || !SEQUENCE.test(value)) return undefined;
  return value;
}

function sanitizeHistoricalRange(value: unknown): { from: string; to: string } | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const from = safeSequence(value.from);
  const to = safeSequence(value.to);
  if (typeof from !== 'string' || typeof to !== 'string') return undefined;
  return { from, to };
}

/**
 * Allowlist serialized readiness detail fields. Unknown keys and invalid values
 * are discarded so query-result IDs, PII, payloads, hashes, URLs, and errors
 * cannot enter persisted or console reports by accident.
 */
export function sanitizeReadinessDetails(details: unknown): SanitizedReadinessDetail[] {
  if (!Array.isArray(details)) return [];

  return details.slice(0, MAX_DETAILS).flatMap((value) => {
    if (!isRecord(value)) return [];
    const sanitized: SanitizedReadinessDetail = {};
    const category = safeCategory(value.category);
    const scope = safeCategory(value.scope);
    const businessDate = typeof value.businessDate === 'string' && ISO_DATE.test(value.businessDate)
      ? value.businessDate
      : undefined;
    const count = nonNegativeInteger(value.count);
    const groupCount = nonNegativeInteger(value.groupCount);
    const eventCount = nonNegativeInteger(value.eventCount);
    const present = nonNegativeInteger(value.present);
    const required = nonNegativeInteger(value.required);
    const status = safeStatus(value.status);
    const trustedThroughSequence = safeSequence(value.trustedThroughSequence);
    const historicalUntrustedRange = sanitizeHistoricalRange(value.historicalUntrustedRange);
    const activeEpoch = value.activeEpoch === null ? null : nonNegativeInteger(value.activeEpoch);
    const historicalFindings = nonNegativeInteger(value.historicalFindings);
    const issueCodes = Array.isArray(value.issueCodes)
      ? value.issueCodes.map(safeCode).filter((code): code is string => Boolean(code))
      : undefined;
    const code = safeCode(value.code);

    if (category !== undefined) sanitized.category = category;
    if (scope !== undefined) sanitized.scope = scope;
    if (businessDate !== undefined) sanitized.businessDate = businessDate;
    if (count !== undefined) sanitized.count = count;
    if (groupCount !== undefined) sanitized.groupCount = groupCount;
    if (eventCount !== undefined) sanitized.eventCount = eventCount;
    if (present !== undefined) sanitized.present = present;
    if (required !== undefined) sanitized.required = required;
    if (status !== undefined) sanitized.status = status;
    if (trustedThroughSequence !== undefined) sanitized.trustedThroughSequence = trustedThroughSequence;
    if (historicalUntrustedRange !== undefined) sanitized.historicalUntrustedRange = historicalUntrustedRange;
    if (activeEpoch !== undefined) sanitized.activeEpoch = activeEpoch;
    if (historicalFindings !== undefined) sanitized.historicalFindings = historicalFindings;
    if (issueCodes !== undefined) sanitized.issueCodes = issueCodes;
    if (code !== undefined) sanitized.code = code;

    return Object.keys(sanitized).length > 0 ? [sanitized] : [];
  });
}

export function createSanitizedReadinessCheck(input: {
  name: string;
  severity: ReadinessSeverity;
  count: number;
  details?: unknown;
}): SanitizedReadinessCheck {
  return {
    name: SAFE_CHECK_NAME.test(input.name) ? input.name : 'invalid_check_name',
    severity: input.severity,
    count: nonNegativeInteger(input.count) ?? 1,
    details: sanitizeReadinessDetails(input.details ?? [])
  };
}

export function createReadinessQueryFailure(name: string): SanitizedReadinessCheck {
  return createSanitizedReadinessCheck({
    name,
    severity: 'BLOCKING',
    count: 1,
    details: [{ category: 'query_error', code: 'READINESS_QUERY_FAILED', count: 1 }]
  });
}

export function createSanitizedReadinessReport(input: {
  generatedAt: string;
  checks: Array<{
    name: string;
    severity: ReadinessSeverity;
    count: number;
    details?: unknown;
  }>;
}): SanitizedReadinessReport {
  const checks = input.checks.map(createSanitizedReadinessCheck);
  const blockingCount = checks.filter((check) => check.severity === 'BLOCKING' && check.count > 0).length;

  return {
    generatedAt: input.generatedAt,
    ok: blockingCount === 0,
    blockingCount,
    checks
  };
}

export function sanitizedReadinessError(code: 'READINESS_PREFLIGHT_FAILED' | 'POST_MIGRATION_VERIFICATION_FAILED') {
  return { ok: false, status: 'ERROR', code };
}
