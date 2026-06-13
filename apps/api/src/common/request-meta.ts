import type { Request } from 'express';

export interface RequestMeta {
  requestIp?: string | null;
  requestDevice?: string | null;
  proxyChain?: string[];
}

export function extractRequestMeta(request?: Request): RequestMeta {
  if (!request) return {};

  const forwardedFor = request.headers['x-forwarded-for'];
  const proxyChain = (Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    requestIp: request.ip || null,
    requestDevice: request.headers['user-agent'] || null,
    proxyChain
  };
}
