import { describe, it, expect } from 'vitest';
import { rateLimit } from '../src/lib/ratelimit';

describe('rateLimit', () => {
  it('allows up to the limit, then blocks', () => {
    const key = 'test-key-' + Math.random();
    for (let i = 0; i < 5; i++) expect(rateLimit(key, 5, 60_000)).toBe(true);
    expect(rateLimit(key, 5, 60_000)).toBe(false);
  });
  it('resets after the window expires', async () => {
    const key = 'test-window-' + Math.random();
    expect(rateLimit(key, 1, 50)).toBe(true);
    expect(rateLimit(key, 1, 50)).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(rateLimit(key, 1, 50)).toBe(true);
  });
  it('tracks keys independently', () => {
    const a = 'key-a-' + Math.random(), b = 'key-b-' + Math.random();
    expect(rateLimit(a, 1, 60_000)).toBe(true);
    expect(rateLimit(a, 1, 60_000)).toBe(false);
    expect(rateLimit(b, 1, 60_000)).toBe(true);
  });
});
