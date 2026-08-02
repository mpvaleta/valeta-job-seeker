import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('oneTimePaymentMethods', () => {
  beforeEach(() => vi.resetModules());
  it('offers PIX and boleto for BRL', async () => {
    process.env.BILLING_CURRENCY = 'brl';
    const { oneTimePaymentMethods } = await import('../src/lib/stripe');
    const methods = oneTimePaymentMethods();
    expect(methods).toContain('pix'); expect(methods).toContain('boleto'); expect(methods).toContain('card');
  });
  it('offers SEPA for EUR', async () => {
    process.env.BILLING_CURRENCY = 'eur';
    const { oneTimePaymentMethods } = await import('../src/lib/stripe');
    expect(oneTimePaymentMethods()).toContain('sepa_debit');
  });
  it('defaults to card only for USD', async () => {
    process.env.BILLING_CURRENCY = 'usd';
    const { oneTimePaymentMethods } = await import('../src/lib/stripe');
    expect(oneTimePaymentMethods()).toEqual(['card']);
  });
});
