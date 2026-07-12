#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const PRIVATE_REPORT_ROOT = 'datasekolah/absensi-private-reports';
const PRIVATE_ACCOUNT_ROOT = `${PRIVATE_REPORT_ROOT}/dataakun`;

const policies = [
  {
    id: 'private-report-tree',
    matches: (path) => isUnder(path, PRIVATE_REPORT_ROOT)
  },
  {
    id: 'private-account-export',
    matches: (path) => isUnder(path, PRIVATE_ACCOUNT_ROOT)
  },
  {
    id: 'named-card-export',
    matches: (path) => isUnder(path, PRIVATE_REPORT_ROOT) && /\.(?:png|jpe?g)$/i.test(path)
  },
  {
    id: 'scan-evidence',
    matches: (path) => isUnder(path, PRIVATE_REPORT_ROOT) && path.split('/').some((segment) => /^(?:scan|evidence)(?:[-_]|$)/i.test(segment))
  },
  {
    id: 'private-archive',
    matches: (path) => isUnder(path, PRIVATE_REPORT_ROOT) && /\.(?:7z|gz|rar|tar|zip)$/i.test(path)
  },
  {
    id: 'private-staff-spreadsheet',
    matches: (path) => path.startsWith('datasekolah/') && /\.xlsx$/i.test(path)
  }
];

function isUnder(path, root) {
  return path === root || path.startsWith(`${root}/`);
}

function resultJson(result) {
  return JSON.stringify(result);
}

function fail(message) {
  console.log(resultJson({ ok: false, checked: 0, blocked: 0, policyIds: [], error: message }));
  process.exitCode = 2;
}

function decodeNullDelimited(buffer) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new Error('input is not valid UTF-8');
  }

  if (text.length > 0 && !text.endsWith('\0')) {
    throw new Error('input is not null-delimited');
  }

  return text.split('\0').filter((path) => path.length > 0);
}

function normalizePath(value) {
  const path = value.replaceAll('\\', '/');
  if (!path || path.startsWith('/') || path.startsWith('//') || /^[a-z]:/i.test(path)) {
    throw new Error('absolute or empty path is not allowed');
  }

  const segments = path.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || hasControlCharacter(segment))) {
    throw new Error('malformed or traversal path is not allowed');
  }

  return segments.join('/').toLowerCase();
}

function hasControlCharacter(value) {
  return [...value].some((character) => {
    const code = character.codePointAt(0);
    return code < 32 || code === 127;
  });
}

function parseArgs(argv) {
  let mode = 'tracked';
  let pathsFile;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--staged') {
      if (mode !== 'tracked' || pathsFile) throw new Error('modes are mutually exclusive');
      mode = 'staged';
    } else if (argument === '--paths-file') {
      if (mode !== 'tracked' || pathsFile || !argv[index + 1]) throw new Error('invalid paths-file arguments');
      mode = 'paths-file';
      pathsFile = argv[index + 1];
      index += 1;
    } else {
      throw new Error('unknown arguments');
    }
  }

  return { mode, pathsFile };
}

function runGit(args) {
  const child = spawnSync('git', args, { cwd: REPOSITORY_ROOT, encoding: 'buffer' });
  if (child.error || child.status !== 0) throw new Error('git path enumeration failed');
  return child.stdout;
}

function enumeratePaths(mode, pathsFile) {
  if (mode === 'paths-file') {
    let contents;
    try {
      contents = readFileSync(pathsFile);
    } catch {
      throw new Error('paths file could not be read');
    }
    return decodeNullDelimited(contents);
  }

  const args = mode === 'staged'
    ? ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']
    : ['ls-files', '--cached', '-z'];
  return decodeNullDelimited(runGit(args));
}

function inspect(rawPaths) {
  const policyIds = new Set();
  let blocked = 0;

  for (const rawPath of rawPaths) {
    const path = normalizePath(rawPath);
    const matched = policies.filter((policy) => policy.matches(path)).map((policy) => policy.id);
    if (matched.length > 0) {
      blocked += 1;
      for (const policyId of matched) policyIds.add(policyId);
    }
  }

  return {
    ok: blocked === 0,
    checked: rawPaths.length,
    blocked,
    policyIds: [...policyIds].sort()
  };
}

try {
  const { mode, pathsFile } = parseArgs(process.argv.slice(2));
  const paths = enumeratePaths(mode, pathsFile);
  const result = inspect(paths);
  console.log(resultJson(result));
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  fail(error instanceof Error ? error.message : 'invalid guard input');
}
