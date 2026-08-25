import { describe, expect, test, vi } from 'vitest';

import {
  InstanceUrlError,
  normalizeInstanceOrigin,
  verifyMobiusOrigin,
} from '../../src/main/instance-url';

describe('normalizeInstanceOrigin', () => {
  test.each([
    ['https://my-mobius.example', 'https://my-mobius.example'],
    ['https://my-mobius.example/shell/', 'https://my-mobius.example'],
    ['http://localhost:8000/', 'http://localhost:8000'],
    ['http://127.0.0.1:15123/shell', 'http://127.0.0.1:15123'],
    ['http://[::1]:15123', 'http://[::1]:15123'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeInstanceOrigin(input)).toBe(expected);
  });

  test.each([
    'http://mobius.example',
    'ftp://mobius.example',
    'https://user:secret@mobius.example',
    'https://mobius.example/chats/1',
    'https://mobius.example/?invite=secret',
  ])('rejects unsafe or ambiguous address %s', (input) => {
    expect(() => normalizeInstanceOrigin(input)).toThrow(InstanceUrlError);
  });
});

describe('verifyMobiusOrigin', () => {
  test('accepts only the ready contract', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ status: 'ready' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    await expect(verifyMobiusOrigin('https://my-mobius.example', fetcher)).resolves.toBe('https://my-mobius.example');
    expect(fetcher).toHaveBeenCalledWith('https://my-mobius.example/api/ready', expect.objectContaining({
      credentials: 'omit',
      redirect: 'error',
    }));
  });

  test('does not mistake an arbitrary healthy server for Möbius', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(verifyMobiusOrigin('https://example.com', fetcher)).rejects.toThrow(/did not identify itself/i);
  });
});
