import { extractRequestMeta } from './request-meta';
import { trustedProxySettingFromEnv } from './trusted-proxy';

describe('request metadata', () => {
  it('uses Express request.ip instead of raw spoofable X-Forwarded-For for actor IP', () => {
    const meta = extractRequestMeta({
      ip: '10.10.0.5',
      headers: {
        'x-forwarded-for': '203.0.113.99, 198.51.100.2',
        'user-agent': 'test-agent'
      }
    } as any);

    expect(meta.requestIp).toBe('10.10.0.5');
    expect(meta.proxyChain).toEqual(['203.0.113.99', '198.51.100.2']);
    expect(meta.requestDevice).toBe('test-agent');
  });

  it('requires explicit trusted proxy configuration', () => {
    expect(trustedProxySettingFromEnv('')).toBe(false);
    expect(trustedProxySettingFromEnv(' loopback, 10.0.0.0/8 ')).toEqual(['loopback', '10.0.0.0/8']);
  });
});
