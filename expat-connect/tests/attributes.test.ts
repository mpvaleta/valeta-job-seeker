import { describe, it, expect } from 'vitest';
import { validateAttributes } from '../src/lib/attributes-validation';

describe('validateAttributes', () => {
  it('accepts valid doctor attributes', () => {
    const r = validateAttributes('doctors', { specialties: ['Cardiologia', 'Clínica geral'], telehealth: true, insurers: 'Blue Cross, Aetna' });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.specialties).toEqual(['Cardiologia', 'Clínica geral']); expect(r.value.telehealth).toBe(true); }
  });
  it('drops unknown keys (injection defense)', () => {
    const r = validateAttributes('doctors', { specialties: ['Cardiologia'], is_admin: true, evil: '<script>' });
    expect(r.ok).toBe(true);
    if (r.ok) { expect('is_admin' in r.value).toBe(false); expect('evil' in r.value).toBe(false); }
  });
  it('rejects invalid multiselect options', () => {
    const r = validateAttributes('doctors', { specialties: ['NotARealSpecialty'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect('specialties' in r.value).toBe(false);
  });
  it('rejects wrong types', () => {
    expect(validateAttributes('doctors', { telehealth: 'yes' }).ok).toBe(false);
    expect(validateAttributes('beauty', { price_range: '$$$$$' }).ok).toBe(false);
  });
  it('accepts valid price range for beauty', () => {
    expect(validateAttributes('beauty', { price_range: '$$', home_service: true }).ok).toBe(true);
  });
  it('returns empty object for null/unknown category', () => {
    expect(validateAttributes('nonexistent', {}).ok).toBe(true);
    const r = validateAttributes('doctors', null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({});
  });
});
