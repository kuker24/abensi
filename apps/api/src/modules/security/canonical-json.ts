export function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    return Object.keys(input)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const item = input[key];
        if (item !== undefined) acc[key] = canonicalize(item);
        return acc;
      }, {});
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
