#!/usr/bin/env node
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const docsDir = 'docs';
const outDir = 'artifacts/security';
mkdirSync(outDir, { recursive: true });
const files = readdirSync(docsDir).filter((name) => /^RISK_ACCEPTANCE_.*\.md$/.test(name));
const now = new Date(process.env.RISK_ACCEPTANCE_CHECK_DATE ?? new Date().toISOString());
const results = [];
let ok = true;

for (const file of files) {
  const path = join(docsDir, file);
  const text = readFileSync(path, 'utf8');
  const expiry = text.match(/^Expiry:\s*(\d{4}-\d{2}-\d{2})\s*$/m)?.[1];
  const review = text.match(/^Review date:\s*(\d{4}-\d{2}-\d{2})\s*$/m)?.[1];
  const owner = text.match(/^Owner:\s*(.+)$/m)?.[1]?.trim();
  const status = text.match(/^Status:\s*(.+)$/m)?.[1]?.trim();
  const expiresAt = expiry ? new Date(`${expiry}T23:59:59.999Z`) : null;
  const expired = !expiresAt || expiresAt <= now;
  const valid = Boolean(owner && review && status && expiresAt && !expired);
  if (!valid) ok = false;
  results.push({ file: path, owner: owner ?? null, status: status ?? null, reviewDate: review ?? null, expiry: expiry ?? null, expired, valid });
}

const report = { ok, checkedAt: now.toISOString(), count: files.length, results };
writeFileSync(join(outDir, 'risk-acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!ok) process.exit(1);
