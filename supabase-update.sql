-- ════════════════════════════════════════════════════════════════════════════
--  Date Night — UPDATE #1 (movies, push notifications, shared locations sync)
--  Run this ONCE in Supabase: SQL Editor → New query → paste → Run.
--  Safe to re-run. Run it AFTER the original supabase-setup.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Movie watchlist ─────────────────────────────────────────────────────────
create table if not exists public.movies (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  notes       text,
  meta        jsonb,                       -- TMDB info: poster, year, plot, genres, runtime, score
  added_by    text,
  watched_at  timestamptz,                 -- null = still on the watchlist
  ratings     jsonb not null default '{}'::jsonb,  -- { "Boody": 5, "Janjon": 4 }
  created_at  timestamptz not null default now()
);

-- (in case the table was created before the meta column existed)
alter table public.movies add column if not exists meta jsonb;

-- ── Push notification subscriptions (one row per device) ───────────────────
create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  endpoint      text not null unique,
  subscription  jsonb not null,
  person        text,
  created_at    timestamptz not null default now()
);

-- ── Access rules (same open model as the rest of the app) ──────────────────
alter table public.movies             enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "anon all" on public.movies;
drop policy if exists "anon all" on public.push_subscriptions;

create policy "anon all" on public.movies             for all using (true) with check (true);
create policy "anon all" on public.push_subscriptions for all using (true) with check (true);

-- ── Live sync for movies + shared prefs (locations & key dates live there) ─
do $$
begin
  begin alter publication supabase_realtime add table public.movies;    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.app_prefs; exception when duplicate_object then null; end;
end $$;

-- Done. ✅
