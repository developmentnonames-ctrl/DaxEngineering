import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { apiUrl } = await import('./api-url.js');

describe('apiUrl', () => {
  it('prefixes /api on the private base URL', () => {
    expect(apiUrl('/health/ready', 'http://api:3000').href).toBe(
      'http://api:3000/api/health/ready',
    );
  });

  it('refuses relative paths and a missing base', () => {
    expect(() => apiUrl('health', 'http://api:3000')).toThrow();
    vi.stubEnv('API_INTERNAL_URL', '');
    expect(() => apiUrl('/health')).toThrow(/API_INTERNAL_URL/);
    vi.unstubAllEnvs();
  });
});
