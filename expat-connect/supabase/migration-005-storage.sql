insert into storage.buckets (id, name, public) values ('professional-photos', 'professional-photos', true) on conflict (id) do nothing;

create policy "public read photos" on storage.objects for select using (bucket_id = 'professional-photos');
create policy "owner upload photos" on storage.objects for insert with check (
  bucket_id = 'professional-photos' and (is_admin() or exists (
    select 1 from professionals where id::text = (storage.foldername(name))[1] and owner_id = auth.uid()))
);
create policy "owner update photos" on storage.objects for update using (
  bucket_id = 'professional-photos' and (is_admin() or exists (
    select 1 from professionals where id::text = (storage.foldername(name))[1] and owner_id = auth.uid()))
);
create policy "owner delete photos" on storage.objects for delete using (
  bucket_id = 'professional-photos' and (is_admin() or exists (
    select 1 from professionals where id::text = (storage.foldername(name))[1] and owner_id = auth.uid()))
);
