-- ════════════════════════════════════════════════════════════════════════════
--  Date Night — shared database setup
--  Run this ONCE in your Supabase project:  SQL Editor → New query → paste → Run
--  It creates the tables, the photo storage bucket, the access rules, and turns
--  on live sync. Safe to re-run (uses IF NOT EXISTS / ON CONFLICT).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Saved places (the "Saved" / swipe-right list) ──────────────────────────
create table if not exists public.saved_places (
  id          text primary key,        -- the place's id from the dataset
  place       jsonb not null,          -- the full place object
  added_by    text,                    -- 'Boody' or 'Janjon'
  created_at  timestamptz not null default now()
);

-- ── Visit log entries ──────────────────────────────────────────────────────
create table if not exists public.log_entries (
  id          uuid primary key default gen_random_uuid(),
  place_name  text not null,
  rating      int,
  notes       text,
  visit_date  timestamptz not null default now(),
  google_url  text,
  lat         double precision,
  lng         double precision,
  added_by    text,
  created_at  timestamptz not null default now()
);

-- ── Photos attached to log entries (anyone can add to any entry) ────────────
create table if not exists public.log_photos (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid references public.log_entries(id) on delete cascade,
  storage_path  text not null,
  added_by      text,
  created_at    timestamptz not null default now()
);

-- ── Flights (Janjon's schedule, shown on the map) ──────────────────────────
create table if not exists public.flights (
  id              uuid primary key default gen_random_uuid(),
  destination     text not null,
  flight_num      text,
  departure_date  timestamptz,
  return_date     timestamptz,
  lat             double precision,   -- looked up from the destination name
  lng             double precision,
  added_by        text,
  created_at      timestamptz not null default now()
);

-- ── Shared preferences / swipe history (one shared row) ─────────────────────
create table if not exists public.app_prefs (
  id          text primary key,       -- always 'shared'
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ── Access rules ────────────────────────────────────────────────────────────
-- This is a private 2-person app with no login, so we allow the public ("anon")
-- key full access to these tables. (See SETUP.md for the security note.)
alter table public.saved_places enable row level security;
alter table public.log_entries  enable row level security;
alter table public.log_photos   enable row level security;
alter table public.flights       enable row level security;
alter table public.app_prefs     enable row level security;

drop policy if exists "anon all" on public.saved_places;
drop policy if exists "anon all" on public.log_entries;
drop policy if exists "anon all" on public.log_photos;
drop policy if exists "anon all" on public.flights;
drop policy if exists "anon all" on public.app_prefs;

create policy "anon all" on public.saved_places for all using (true) with check (true);
create policy "anon all" on public.log_entries  for all using (true) with check (true);
create policy "anon all" on public.log_photos   for all using (true) with check (true);
create policy "anon all" on public.flights       for all using (true) with check (true);
create policy "anon all" on public.app_prefs     for all using (true) with check (true);

-- ── Live sync (so both phones update instantly) ─────────────────────────────
do $$
begin
  begin alter publication supabase_realtime add table public.saved_places; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.log_entries;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.log_photos;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.flights;      exception when duplicate_object then null; end;
end $$;

-- ── Photo storage bucket ────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('log-photos', 'log-photos', true)
on conflict (id) do update set public = true;

-- Allow the public key to read/upload/delete photos in that bucket only.
drop policy if exists "log-photos read"   on storage.objects;
drop policy if exists "log-photos write"  on storage.objects;
drop policy if exists "log-photos delete" on storage.objects;

create policy "log-photos read"   on storage.objects for select using (bucket_id = 'log-photos');
create policy "log-photos write"  on storage.objects for insert with check (bucket_id = 'log-photos');
create policy "log-photos delete" on storage.objects for delete using (bucket_id = 'log-photos');

-- Done. ✅
