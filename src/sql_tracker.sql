-- ── Habit Tracker Tables ─────────────────────────────────────────
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

-- 1. habit_trackers — one row per tracker the user creates
create table if not exists public.habit_trackers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  color       text not null default '#3b82f6',
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- 2. habit_logs — one row per (user, tracker, date) check-off
create table if not exists public.habit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  tracker_id  uuid not null references public.habit_trackers(id) on delete cascade,
  log_date    date not null,
  created_at  timestamptz not null default now(),
  -- prevent duplicate check-offs for the same day
  unique (user_id, tracker_id, log_date)
);

-- ── Indexes ───────────────────────────────────────────────────────
create index if not exists habit_trackers_user_id_idx on public.habit_trackers(user_id);
create index if not exists habit_logs_tracker_id_idx  on public.habit_logs(tracker_id);
create index if not exists habit_logs_user_date_idx   on public.habit_logs(user_id, log_date);

-- ── Row Level Security ────────────────────────────────────────────
alter table public.habit_trackers enable row level security;
alter table public.habit_logs      enable row level security;

-- habit_trackers policies
create policy "Users can view their own trackers"
  on public.habit_trackers for select
  using (auth.uid() = user_id);

create policy "Users can insert their own trackers"
  on public.habit_trackers for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own trackers"
  on public.habit_trackers for update
  using (auth.uid() = user_id);

create policy "Users can delete their own trackers"
  on public.habit_trackers for delete
  using (auth.uid() = user_id);

-- habit_logs policies
create policy "Users can view their own logs"
  on public.habit_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert their own logs"
  on public.habit_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own logs"
  on public.habit_logs for delete
  using (auth.uid() = user_id);
