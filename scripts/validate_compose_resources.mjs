#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const composePath = process.argv[2];
if (!composePath) {
  console.error('Usage: node scripts/validate_compose_resources.mjs <docker-compose-config.json>');
  process.exit(2);
}

const config = JSON.parse(readFileSync(composePath, 'utf8'));
const services = config.services || {};
const steadyServices = ['postgres', 'redis', 'api', 'worker', 'web', 'reverse-proxy'];
const hardenedServices = ['migrate', 'api', 'worker', 'web', 'reverse-proxy'];
const profileMemMiB = Number(process.env.SCHOOLHUB_VPS_PROFILE_MEM_MIB || '7941');
const profileCpu = Number(process.env.SCHOOLHUB_VPS_PROFILE_CPUS || '4');
const minHostReserveMiB = Number(process.env.SCHOOLHUB_MIN_HOST_RESERVE_MIB || '1280');
const minHostReserveCpu = Number(process.env.SCHOOLHUB_MIN_HOST_RESERVE_CPUS || '1');
const maxSteadyMemMiB = profileMemMiB - minHostReserveMiB;
const maxSteadyCpu = profileCpu - minHostReserveCpu;

function fail(message) {
  throw new Error(message);
}

function parseMemory(value, field) {
  if (value === undefined || value === null || value === '') fail(`${field} is missing`);
  if (typeof value === 'number') return value > 1024 * 1024 ? value / 1024 / 1024 : value;
  const raw = String(value).trim().toLowerCase();
  const match = raw.match(/^(\d+(?:\.\d+)?)(b|kb|k|mb|m|gb|g|mib|gib)?$/);
  if (!match) fail(`${field} has unsupported memory value: ${value}`);
  const amount = Number(match[1]);
  const unit = match[2];
  if (!unit) return amount > 1024 * 1024 ? amount / 1024 / 1024 : amount;
  if (unit === 'b') return amount / 1024 / 1024;
  if (unit === 'kb' || unit === 'k') return amount / 1024;
  if (unit === 'gb' || unit === 'g' || unit === 'gib') return amount * 1024;
  return amount;
}

function parseCpu(value, field) {
  if (value === undefined || value === null || value === '') fail(`${field} is missing`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) fail(`${field} has invalid CPU value: ${value}`);
  return parsed;
}

function commandText(serviceName) {
  const command = services[serviceName]?.command;
  if (Array.isArray(command)) return command.join(' ');
  return String(command || '');
}

function envMap(serviceName) {
  const env = services[serviceName]?.environment || {};
  if (Array.isArray(env)) {
    return Object.fromEntries(env.map((entry) => {
      const [key, ...rest] = String(entry).split('=');
      return [key, rest.join('=')];
    }));
  }
  return env;
}

function includesAll(items, required, field) {
  const values = new Set((items || []).map(String));
  for (const item of required) {
    if (!values.has(item)) fail(`${field} missing ${item}`);
  }
}

for (const name of [...steadyServices, 'migrate']) {
  if (!services[name]) fail(`service missing: ${name}`);
  if (!services[name].pids_limit && !services[name].pidsLimit) fail(`${name} missing pids_limit`);
  parseMemory(services[name].mem_limit ?? services[name].memLimit, `${name}.mem_limit`);
  parseCpu(services[name].cpus, `${name}.cpus`);
  if (!services[name].ulimits?.nofile) fail(`${name} missing nofile ulimit`);
}

for (const name of steadyServices) {
  if (!services[name].healthcheck) fail(`${name} missing healthcheck`);
}

for (const name of hardenedServices) {
  if (services[name].read_only !== true) fail(`${name} must remain read_only=true`);
  includesAll(services[name].cap_drop, ['ALL'], `${name}.cap_drop`);
  includesAll(services[name].security_opt, ['no-new-privileges:true'], `${name}.security_opt`);
}

const totals = steadyServices.reduce((acc, name) => {
  const service = services[name];
  acc.memoryMiB += parseMemory(service.mem_limit ?? service.memLimit, `${name}.mem_limit`);
  acc.cpus += parseCpu(service.cpus, `${name}.cpus`);
  return acc;
}, { memoryMiB: 0, cpus: 0 });

if (totals.memoryMiB > maxSteadyMemMiB) {
  fail(`steady memory budget ${totals.memoryMiB.toFixed(0)} MiB exceeds ${maxSteadyMemMiB.toFixed(0)} MiB profile cap`);
}
if (totals.cpus > maxSteadyCpu + 0.0001) {
  fail(`steady CPU budget ${totals.cpus.toFixed(2)} exceeds ${maxSteadyCpu.toFixed(2)} CPU profile cap`);
}

const postgresCommand = commandText('postgres');
for (const setting of ['fsync=on', 'full_page_writes=on', 'synchronous_commit=on', 'wal_compression=on']) {
  if (!postgresCommand.includes(setting)) fail(`postgres command must include ${setting}`);
}
for (const setting of ['shared_buffers=768MB', 'effective_cache_size=5GB', 'max_connections=80']) {
  if (!postgresCommand.includes(setting)) fail(`postgres command must include expected default ${setting}`);
}

const redisCommand = commandText('redis');
for (const setting of ['--appendonly yes', '--appendfsync everysec', '--maxmemory 512mb', '--maxmemory-policy noeviction']) {
  if (!redisCommand.includes(setting)) fail(`redis command must include ${setting}`);
}
const redisMemMiB = parseMemory(services.redis.mem_limit ?? services.redis.memLimit, 'redis.mem_limit');
const redisMaxMemoryMiB = parseMemory('512mb', 'redis.maxmemory');
if (redisMaxMemoryMiB >= redisMemMiB) fail('redis maxmemory must stay below redis container mem_limit');

for (const [serviceName, minHeap] of [['api', 768], ['worker', 256], ['migrate', 384]]) {
  const nodeOptions = String(envMap(serviceName).NODE_OPTIONS || '');
  const match = nodeOptions.match(/--max-old-space-size=(\d+)/);
  if (!match) fail(`${serviceName} NODE_OPTIONS missing --max-old-space-size`);
  if (Number(match[1]) < minHeap) fail(`${serviceName} NODE_OPTIONS heap cap too small: ${match[1]}`);
}

const summary = {
  ok: true,
  profile: { memoryMiB: profileMemMiB, cpus: profileCpu, minHostReserveMiB, minHostReserveCpu },
  steadyBudget: {
    memoryMiB: Math.round(totals.memoryMiB),
    memoryPercent: Number(((totals.memoryMiB / profileMemMiB) * 100).toFixed(1)),
    cpus: Number(totals.cpus.toFixed(2))
  },
  services: Object.fromEntries(steadyServices.map((name) => [name, {
    memLimitMiB: Math.round(parseMemory(services[name].mem_limit ?? services[name].memLimit, `${name}.mem_limit`)),
    cpus: parseCpu(services[name].cpus, `${name}.cpus`)
  }]))
};

console.log(JSON.stringify(summary, null, 2));
