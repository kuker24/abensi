#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) throw new Error('Usage: node scripts/observability_log_check.mjs <api-log-file>');
const outPath = process.env.OBSERVABILITY_OUTPUT || 'artifacts/observability/log-check.json';
const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
const parsed = [];
for (const line of lines) {
  try {
    const json = JSON.parse(line);
    if (json.type === 'http_request') parsed.push(json);
  } catch {
    // Ignore framework startup logs; request logs are structured JSON.
  }
}
const required = ['requestId', 'method', 'path', 'statusCode', 'durationMs', 'userAgent', 'ip'];
const invalid = parsed.filter((entry) => required.some((key) => !(key in entry)) || (entry.userAgent !== null && entry.userAgent !== '[redacted]'));
const ok = parsed.length > 0 && invalid.length === 0;
const report = { ok, file, requestLogCount: parsed.length, invalidCount: invalid.length, sample: parsed.slice(0, 5) };
mkdirSync(outPath.split('/').slice(0, -1).join('/') || '.', { recursive: true });
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!ok) process.exit(1);
