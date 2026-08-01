import { NextResponse } from 'next/server';
import { CATEGORY_FIELDS, fieldsForCategory } from '@/lib/category-fields';

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug');
  if (slug) return NextResponse.json({ slug, fields: fieldsForCategory(slug) });
  return NextResponse.json({ categories: CATEGORY_FIELDS });
}
