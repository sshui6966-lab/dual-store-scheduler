create table if not exists public.scheduler_settings (
  id boolean primary key default true check (id),
  owner_id uuid unique references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.app_state (
  id text primary key check (id in ('manager', 'public')),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.scheduler_settings enable row level security;
alter table public.app_state enable row level security;

revoke all on table public.scheduler_settings from anon, authenticated;
revoke all on table public.app_state from anon, authenticated;
grant select on table public.app_state to anon, authenticated;
grant insert, update on table public.app_state to authenticated;

create or replace function public.is_scheduler_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.scheduler_settings
    where owner_id = (select auth.uid())
  );
$$;

create or replace function public.claim_scheduler_manager()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  insert into public.scheduler_settings (id, owner_id)
  values (true, auth.uid())
  on conflict (id) do nothing;

  return public.is_scheduler_manager();
end;
$$;

revoke execute on function public.is_scheduler_manager() from public;
grant execute on function public.is_scheduler_manager() to anon, authenticated;
revoke execute on function public.claim_scheduler_manager() from public, anon;
grant execute on function public.claim_scheduler_manager() to authenticated;

drop policy if exists "Public can read published schedule" on public.app_state;
create policy "Public can read published schedule"
on public.app_state for select
to anon, authenticated
using (id = 'public' or public.is_scheduler_manager());

drop policy if exists "Manager can insert schedule state" on public.app_state;
create policy "Manager can insert schedule state"
on public.app_state for insert
to authenticated
with check (public.is_scheduler_manager());

drop policy if exists "Manager can update schedule state" on public.app_state;
create policy "Manager can update schedule state"
on public.app_state for update
to authenticated
using (public.is_scheduler_manager())
with check (public.is_scheduler_manager());
