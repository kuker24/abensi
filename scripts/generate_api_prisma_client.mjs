#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = resolve(repoRoot, 'apps/api');
const tempDir = resolve(apiDir, '.prisma-generate');
const tempSchema = resolve(tempDir, 'schema.prisma');
const sourceSchema = resolve(repoRoot, 'prisma/schema.prisma');
const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';

mkdirSync(tempDir, { recursive: true });
copyFileSync(sourceSchema, tempSchema);

try {
  const result = spawnSync(npxBin, ['prisma', 'generate', '--schema', '.prisma-generate/schema.prisma'], {
    cwd: apiDir,
    env: process.env,
    stdio: 'inherit'
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
