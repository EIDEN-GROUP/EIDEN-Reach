create policy "users can create own profile"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());
