-- Fix: paid plan upgrades were silently discarded.
--
-- protect_pro_fields() (migration-002) reverts status/verified/plan for anyone
-- who is not an admin. It decides that with is_admin(), which resolves through
-- auth.uid() — i.e. it needs a logged-in user session.
--
-- The Stripe webhook has no user session. It writes with the service_role key
-- (src/app/api/billing/webhook/route.ts, setPlan()), so auth.uid() is null,
-- is_admin() is false, and the trigger reset new.plan back to old.plan. The
-- UPDATE reported success and changed nothing: money captured, plan never
-- applied, no error anywhere. Same for any other server-only writer.
--
-- service_role is never exposed to the client (see CLAUDE.md rule 6 — it is
-- used in exactly three server-only places), so letting it through alongside
-- admins does not give professionals a self-elevation path. Owners are still
-- blocked, which is the property migration-002 exists to guarantee.
--
-- Note on detection: current_user is useless here, because inside a SECURITY
-- DEFINER function it is always the function owner. current_setting('role')
-- reports the role PostgREST switched into for the request, and does survive
-- into the function body.
--
-- Caveat: a manual UPDATE to professionals.status/verified/plan run straight
-- from the Supabase SQL editor is still reverted, since that session is not
-- service_role and has no auth.uid(). Moderate through /admin instead.

create or replace function protect_pro_fields()
returns trigger language plpgsql security definer as $$
begin
  if not (is_admin() or current_setting('role', true) = 'service_role') then
    new.status := old.status; new.verified := old.verified; new.plan := old.plan;
  end if;
  return new;
end $$;
