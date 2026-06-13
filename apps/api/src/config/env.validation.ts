type Env = Record<string, string | undefined>;

const PLACEHOLDER_VALUES = new Set([
  '',
  'change-me',
  'changeme',
  'dev-only-secret',
  'secret',
  'password',
  'admin',
  'Admin#12345',
  'Beta@2026!'
]);

function requireValue(env: Env, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} wajib diisi.`);
  if (PLACEHOLDER_VALUES.has(value)) throw new Error(`${name} memakai nilai placeholder/lemah.`);
  return value;
}

function requireSecret(env: Env, name: string, minLength = 32) {
  const value = requireValue(env, name);
  if (value.length < minLength) throw new Error(`${name} terlalu pendek. Minimal ${minLength} karakter acak.`);
  if (/^(.)\1+$/.test(value)) throw new Error(`${name} tidak boleh berupa karakter berulang.`);
  return value;
}

function validateUrl(value: string, name: string, allowedProtocols: string[]) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} harus berupa URL valid.`);
  }
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`${name} harus memakai protokol ${allowedProtocols.join(' atau ')}.`);
  }
}

function validatePort(env: Env) {
  const raw = env.PORT?.trim() || env.API_PORT?.trim() || '3000';
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT tidak valid: ${raw}`);
  }
}

export function validateEnvironment(config: Env) {
  validatePort(config);

  if (config.DATABASE_URL) validateUrl(config.DATABASE_URL, 'DATABASE_URL', ['postgresql:', 'postgres:']);
  if (config.REDIS_URL) validateUrl(config.REDIS_URL, 'REDIS_URL', ['redis:', 'rediss:']);

  const nodeEnv = config.NODE_ENV || 'development';
  if (nodeEnv === 'production') {
    requireValue(config, 'DATABASE_URL');
    requireSecret(config, 'JWT_SECRET', 48);
    requireSecret(config, 'WORKER_TOKEN', 32);
    requireSecret(config, 'READER_SECRET_ENCRYPTION_KEY', 32);

    const cors = requireValue(config, 'CORS_ORIGIN');
    for (const origin of cors.split(',').map((item) => item.trim()).filter(Boolean)) {
      validateUrl(origin, 'CORS_ORIGIN', ['https:']);
    }

    for (const passwordName of ['ADMIN_PASSWORD', 'DEFAULT_USER_PASSWORD', 'DEVELOPER_PASSWORD']) {
      const value = config[passwordName]?.trim();
      if (value && PLACEHOLDER_VALUES.has(value)) {
        throw new Error(`${passwordName} memakai password contoh/predictable.`);
      }
    }
  }

  return config;
}
