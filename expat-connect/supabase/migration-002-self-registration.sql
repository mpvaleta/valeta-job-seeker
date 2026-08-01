create policy "self register listing" on professionals for insert
  with check (auth.uid() is not null and owner_id = auth.uid() and status = 'pending' and verified = false and plan = 'free');

create or replace function protect_pro_fields()
returns trigger language plpgsql security definer as $$
begin
  if not is_admin() then
    new.status := old.status; new.verified := old.verified; new.plan := old.plan;
  end if;
  return new;
end $$;
create trigger on_pro_update_protect before update on professionals for each row execute function protect_pro_fields();
