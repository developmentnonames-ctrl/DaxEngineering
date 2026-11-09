import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { contentDisposition, plainText, relayFile } = await import('./relay');

describe('relayFile', () => {
  it('streams the body with private, no-store headers', async () => {
    const upstream = new Response('%PDF-1.7', {
      headers: { 'content-length': '8', 'set-cookie': 'x=1' },
    });
    const res = relayFile(upstream, {
      contentType: 'application/pdf',
      disposition: contentDisposition('inline', 'labels.pdf'),
    });
    expect(await res.text()).toBe('%PDF-1.7');
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('content-disposition')).toBe(
      'inline; filename="labels.pdf"',
    );
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('keeps file names header-safe', () => {
    expect(contentDisposition('attachment', 'a"b\r\n.csv')).toBe(
      'attachment; filename="a_b__.csv"',
    );
    expect(plainText(403, 'No').status).toBe(403);
  });
});
