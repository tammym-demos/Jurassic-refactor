import { describe, it, expect } from 'vitest';
import { sanitize, sanitizeString } from '../sanitize.js';

describe('sanitizeString', () => {
  it('should redact email addresses', () => {
    expect(sanitizeString('contact user@example.com now')).toBe('contact [EMAIL REDACTED] now');
  });

  it('should redact SSNs', () => {
    expect(sanitizeString('SSN: 123-45-6789')).toBe('SSN: [SSN REDACTED]');
  });

  it('should redact US phone numbers with parentheses', () => {
    expect(sanitizeString('call (555) 123-4567')).toBe('call [PHONE REDACTED]');
  });

  it('should redact US phone numbers with dashes', () => {
    expect(sanitizeString('call 555-123-4567')).toBe('call [PHONE REDACTED]');
  });

  it('should redact IPv4 addresses', () => {
    expect(sanitizeString('host 192.168.1.1 is up')).toBe('host [IP REDACTED] is up');
  });

  it('should redact multiple PII values in one string', () => {
    const input = 'Email: user@test.com, IP: 10.0.0.1';
    const result = sanitizeString(input);
    expect(result).toBe('Email: [EMAIL REDACTED], IP: [IP REDACTED]');
  });
});

describe('sanitize', () => {
  it('should return null as-is', () => {
    expect(sanitize(null)).toBeNull();
  });

  it('should return undefined as-is', () => {
    expect(sanitize(undefined)).toBeUndefined();
  });

  it('should pass through numbers unchanged', () => {
    expect(sanitize(42)).toBe(42);
  });

  it('should pass through booleans unchanged', () => {
    expect(sanitize(true)).toBe(true);
  });

  it('should redact PII in a plain string', () => {
    expect(sanitize('user@example.com')).toBe('[EMAIL REDACTED]');
  });

  it('should redact PII in nested objects', () => {
    const input = {
      user: { email: 'a@b.com', age: 30 },
      note: 'SSN is 111-22-3333',
    };
    const result = sanitize(input) as Record<string, unknown>;
    expect((result.user as Record<string, unknown>).email).toBe('[EMAIL REDACTED]');
    expect((result.user as Record<string, unknown>).age).toBe(30);
    expect(result.note).toBe('SSN is [SSN REDACTED]');
  });

  it('should redact PII in arrays', () => {
    const input = ['user@x.com', 42, '192.168.0.1'];
    const result = sanitize(input) as unknown[];
    expect(result).toEqual(['[EMAIL REDACTED]', 42, '[IP REDACTED]']);
  });

  it('should handle deeply nested structures', () => {
    const input = { a: [{ b: '10.0.0.1' }] };
    const result = sanitize(input) as Record<string, unknown>;
    expect(((result.a as unknown[])[0] as Record<string, unknown>).b).toBe('[IP REDACTED]');
  });
});
