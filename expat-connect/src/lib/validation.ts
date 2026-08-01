import { z } from 'zod';

// Only allow http/https URLs — z.string().url() alone accepts javascript: URIs (XSS risk).
const safeUrl = z.string().url().max(200)
  .refine((u) => /^https?:\/\//i.test(u), { message: 'URL must start with http:// or https://' });

export const searchParamsSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(50).optional(),
  country: z.string().trim().length(2).toUpperCase().optional(),
  city: z.string().trim().max(80).optional(),
  language: z.string().trim().max(5).optional(),
  online: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1)
});

export const reviewSchema = z.object({
  professional_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(10, 'Review must be at least 10 characters').max(2000)
});

export const favoriteSchema = z.object({
  professional_id: z.string().uuid()
});

export const professionalSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  category_id: z.number().int().positive(),
  headline: z.string().trim().max(140),
  bio: z.string().trim().max(4000),
  origin_country: z.string().length(2).toUpperCase().default('BR'),
  country: z.string().length(2).toUpperCase(),
  city: z.string().trim().min(1).max(80),
  address: z.string().trim().max(200).optional().default(''),
  phone: z.string().trim().max(30).optional().default(''),
  whatsapp: z.string().trim().max(30).optional().default(''),
  email: z.string().email().max(120).optional().or(z.literal('')),
  website: safeUrl.optional().or(z.literal('')),
  credentials: z.string().trim().max(300).optional().default(''),
  accepts_insurance: z.string().trim().max(300).optional().default(''),
  online_service: z.boolean().default(false),
  languages: z.array(z.string().max(5)).min(1).max(10)
});
