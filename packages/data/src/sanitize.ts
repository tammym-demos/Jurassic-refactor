/** Regex patterns for detecting PII in string values. */
const PII_REPLACEMENTS: [RegExp, string][] = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL REDACTED]'],
  [/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN REDACTED]'],
  [/\(\d{3}\)\s*\d{3}-\d{4}/g, '[PHONE REDACTED]'],
  [/\b\d{3}-\d{3}-\d{4}\b/g, '[PHONE REDACTED]'],
  [/\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g, '[IP REDACTED]'],
];

/** Mask PII patterns in a single string value. */
export function sanitizeString(value: string): string {
  let result = value;
  for (const [pattern, replacement] of PII_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/** Deep-clone data and recursively mask PII in all string values. */
export function sanitize(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }
  if (typeof data === 'string') {
    return sanitizeString(data);
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitize(item));
  }
  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      result[key] = sanitize(value);
    }
    return result;
  }
  return data;
}
