import type { Request } from 'express';

export interface RequestMeta {
  requestIp?: string | null;
  requestDevice?: string | null;
}

export function extractRequestMeta(request?: Request): RequestMeta {
  if (!request) return {};

  const forwardedFor = request.headers['x-forwarded-for'];
  const forwardedIp =
    typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0]?.trim()
      : Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : undefined;

  return {
    requestIp: forwardedIp || request.ip || null,
    requestDevice: request.headers['user-agent'] || null
  };
}
