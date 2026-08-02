import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('priceIdToPlan', () => {
  beforeEach(() => { vi.resetModules(); });
  it('maps configured price IDs to plan tiers', async () => {
    process.env.STRIPE_PRICE_FEATURED = 'price_feat';
    process.env.STRIPE_PRICE_PREMIUM = 'price_prem';
    const { priceIdToPlan } = await import('../src/lib/stripe');
    expect(priceIdToPlan('price_feat')).toBe('featured');
    expect(priceIdToPlan('price_prem')).toBe('premium');
  });
  it('returns null for unknown or empty price IDs', async () => {
    process.env.STRIPE_PRICE_FEATURED = 'price_feat';
    process.env.STRIPE_PRICE_PREMIUM = 'price_prem';
    const { priceIdToPlan } = await import('../src/lib/stripe');
    expect(priceIdToPlan('price_unknown')).toBeNull();
    expect(priceIdToPlan('')).toBeNull();
    expect(priceIdToPlan(null)).toBeNull();
  });
});
