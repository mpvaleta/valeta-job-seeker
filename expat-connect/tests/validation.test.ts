import { describe, it, expect } from 'vitest';
import { searchParamsSchema, reviewSchema, professionalSchema } from '../src/lib/validation';

describe('searchParamsSchema', () => {
  it('accepts valid search params', () => {
    const r = searchParamsSchema.safeParse({ q: 'dentista', country: 'us', page: '2' });
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.country).toBe('US'); expect(r.data.page).toBe(2); }
  });
  it('rejects oversized query strings (abuse protection)', () => {
    expect(searchParamsSchema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
  });
  it('rejects absurd page numbers (scraping protection)', () => {
    expect(searchParamsSchema.safeParse({ page: '9999' }).success).toBe(false);
  });
  it('defaults page to 1', () => {
    const r = searchParamsSchema.safeParse({});
    expect(r.success && r.data.page).toBe(1);
  });
});

describe('reviewSchema', () => {
  const valid = { professional_id: '5f0c9f3e-2c9a-4b8e-9d1a-111111111111', rating: 5, body: 'Excelente atendimento, super recomendo.' };
  it('accepts a valid review', () => { expect(reviewSchema.safeParse(valid).success).toBe(true); });
  it('rejects ratings outside 1-5', () => {
    expect(reviewSchema.safeParse({ ...valid, rating: 0 }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...valid, rating: 6 }).success).toBe(false);
  });
  it('rejects too-short and too-long bodies', () => {
    expect(reviewSchema.safeParse({ ...valid, body: 'ok' }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...valid, body: 'x'.repeat(2001) }).success).toBe(false);
  });
  it('rejects invalid professional ids', () => {
    expect(reviewSchema.safeParse({ ...valid, professional_id: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('professionalSchema', () => {
  const valid = { full_name: 'Dra. Teste Silva', category_id: 1, headline: 'Dentista brasileira em Boston', bio: 'Atendimento em português.', country: 'us', city: 'Boston', languages: ['pt', 'en'] };
  it('accepts a valid professional and uppercases country', () => {
    const r = professionalSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.country).toBe('US');
  });
  it('requires at least one language', () => {
    expect(professionalSchema.safeParse({ ...valid, languages: [] }).success).toBe(false);
  });
  it('rejects malformed website URLs (XSS/phishing protection)', () => {
    expect(professionalSchema.safeParse({ ...valid, website: 'javascript:alert(1)' }).success).toBe(false);
  });
  it('accepts empty-string optional email/website', () => {
    expect(professionalSchema.safeParse({ ...valid, email: '', website: '' }).success).toBe(true);
  });
});
