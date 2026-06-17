#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/validate_deployment_evidence.mjs FILE');
  process.exit(2);
}
const data = JSON.parse(readFileSync(file, 'utf8'));
const required = [
  'startingSha',
  'endingSha',
  'deploymentTime',
  'currentImages',
  'targetImages',
  'currentContainers',
  'finalContainers',
  'migrationState',
  'backup',
  'auditVerification',
  'postMigration',
  'bootstrap',
  'localHealth',
  'publicHttps',
  'finalStatus'
];
const missing = required.filter((key) => !(key in data));
if (missing.length) {
  console.error(`Deployment evidence missing keys: ${missing.join(', ')}`);
  process.exit(1);
}
if (!Array.isArray(data.currentImages) || !Array.isArray(data.targetImages)) {
  console.error('Image fields must be arrays.');
  process.exit(1);
}
if (!data.migrationState || !('before' in data.migrationState) || !('after' in data.migrationState)) {
  console.error('migrationState must contain before and after.');
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, file }));
