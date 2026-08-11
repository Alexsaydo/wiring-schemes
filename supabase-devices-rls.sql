-- Run once in Supabase SQL Editor for public.devices.
-- This lets each signed-in user read/write only their own schemes.

alter table public.devices enable row level security;

drop policy if exists devices_select_own on public.devices;
drop policy if exists devices_insert_own on public.devices;
drop policy if exists devices_update_own on public.devices;
drop policy if exists devices_delete_own on public.devices;

create policy devices_select_own
on public.devices for select
to authenticated
using (auth.uid() = user_id);

create policy devices_insert_own
on public.devices for insert
to authenticated
with check (auth.uid() = user_id);

create policy devices_update_own
on public.devices for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy devices_delete_own
on public.devices for delete
to authenticated
using (auth.uid() = user_id);
