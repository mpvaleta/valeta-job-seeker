import { CATEGORY_FIELDS, type CategoryField } from '@/lib/category-fields';

type Result = { ok: true; value: Record<string, unknown> } | { ok: false; error: string };
const PRICE_RANGES = ['$', '$$', '$$$', '$$$$'];

export function validateAttributes(categorySlug: string, raw: unknown): Result {
  if (raw === null || raw === undefined) return { ok: true, value: {} };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Atributos inválidos' };

  const fields = CATEGORY_FIELDS[categorySlug] ?? [];
  const byKey = new Map<string, CategoryField>(fields.map((f) => [f.key, f]));
  const input = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(input)) {
    const field = byKey.get(key);
    if (!field) continue; // silently drop unknown keys (defense against injection)
    if (val === null || val === '') continue;

    switch (field.type) {
      case 'text': case 'textarea': {
        if (typeof val !== 'string') return { ok: false, error: `${field.label}: texto inválido` };
        const max = 'maxLength' in field && field.maxLength ? field.maxLength : 2000;
        if (val.length > max) return { ok: false, error: `${field.label}: muito longo` };
        out[key] = val.trim();
        break;
      }
      case 'boolean': {
        if (typeof val !== 'boolean') return { ok: false, error: `${field.label}: valor inválido` };
        out[key] = val;
        break;
      }
      case 'multiselect': {
        if (!Array.isArray(val)) return { ok: false, error: `${field.label}: seleção inválida` };
        const allowed = new Set(field.options);
        const clean = val.filter((v) => typeof v === 'string' && allowed.has(v));
        if (clean.length) out[key] = clean;
        break;
      }
      case 'price_range': {
        if (typeof val !== 'string' || !PRICE_RANGES.includes(val)) {
          return { ok: false, error: `${field.label}: faixa inválida` };
        }
        out[key] = val;
        break;
      }
    }
  }
  return { ok: true, value: out };
}
