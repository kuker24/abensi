export function trustedProxySettingFromEnv(raw = process.env.TRUSTED_PROXY_CIDRS): false | string[] {
  const values = (raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length ? values : false;
}
