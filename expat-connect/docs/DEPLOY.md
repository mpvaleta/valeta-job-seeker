# Deploy Guide — do lançamento em ~30 minutos

## 1. Supabase — ~10 min
1. Crie conta grátis em supabase.com → "New project". Escolha uma região
   próxima da cidade-alvo (ex: East US para Boston/Orlando/Miami).
2. SQL Editor → rode, um de cada vez: `schema.sql` → `migration-002` até
   `migration-009` (nessa ordem) → `seed.sql`.
3. Settings → API: copie Project URL, anon key, e service_role key (SECRETA).

## 2. Segurança do Supabase — 5 min, não pule
1. Authentication → Providers → Email: mantenha "Confirm email" LIGADO.
2. Authentication → Settings: ligue "Leaked password protection".

## 3. GitHub + Vercel — ~10 min
1. Suba esta pasta (sem `node_modules`/`.next`) para um repositório.
2. vercel.com → Add New → Project → importe o repositório.
3. Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`. Deixe `BILLING_CURRENCY=usd`
   (mercado de lançamento é EUA).
4. Deploy. O `vercel.json` já configura o cron de notificações automaticamente.

## 4. Domínio
1. Compre em Cloudflare Registrar ou Namecheap.
2. Vercel → Settings → Domains → adicione e siga o DNS.
3. Atualize `NEXT_PUBLIC_SITE_URL` e refaça o deploy.

## 5. Vire admin
Cadastre-se no site, depois no SQL Editor:
```sql
update profiles set role = 'admin' where id = (select id from auth.users where email = 'SEU-EMAIL');
```

## 6. Popular o diretório
`/admin` → "+ Nova listagem" para poucos; `scripts/import-professionals.mjs`
com `scripts/professionals-template.csv` para lote.

## Custos
Gratuito nos planos free de Supabase e Vercel até tráfego relevante. Único
gasto obrigatório: domínio (~US$10–15/ano).
