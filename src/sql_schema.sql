-- ══════════════════════════════════════════════════════════════
-- AddApp — full schema migration
-- Safe to run on an existing database: uses IF NOT EXISTS + ADD COLUMN IF NOT EXISTS
-- Run once in Supabase SQL Editor (Dashboard → SQL Editor → New query → Run)
-- ══════════════════════════════════════════════════════════════

-- ── Routines ─────────────────────────────────────────────────
create table if not exists public.routines (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  emoji       text not null default '⚡',
  type        text not null default 'routine',
  time        text,
  days        jsonb not null default '[]',
  steps       jsonb not null default '[]',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

-- Columns that may be missing on older installs
alter table public.routines add column if not exists emoji    text not null default '⚡';
alter table public.routines add column if not exists type     text not null default 'routine';
alter table public.routines add column if not exists days     jsonb not null default '[]';
alter table public.routines add column if not exists steps    jsonb not null default '[]';
alter table public.routines add column if not exists updated_at timestamptz;

-- ── Routine logs ──────────────────────────────────────────────
create table if not exists public.routine_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  routine_id  uuid references public.routines(id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  status      text not null default 'in_progress',
  step_index  int not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.routine_logs add column if not exists step_index int not null default 0;
alter table public.routine_logs add column if not exists ended_at   timestamptz;

-- ── Journal — daily entries ───────────────────────────────────
create table if not exists public.journal_days (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  entry_date         date not null,
  schedule           jsonb default '{}',
  priorities         jsonb default '[]',
  mood               int2,
  weather_temp       int2,
  weather_condition  text,
  gratitude          text,
  proud_of           text,
  affirmation        text,
  excited_about      text,
  look_forward       text,
  notes              text,
  pen_data           jsonb default '{}',
  updated_at         timestamptz,
  created_at         timestamptz not null default now(),
  unique (user_id, entry_date)
);

alter table public.journal_days add column if not exists schedule          jsonb default '{}';
alter table public.journal_days add column if not exists priorities        jsonb default '[]';
alter table public.journal_days add column if not exists mood              int2;
alter table public.journal_days add column if not exists weather_temp      int2;
alter table public.journal_days add column if not exists weather_condition text;
alter table public.journal_days add column if not exists gratitude         text;
alter table public.journal_days add column if not exists proud_of          text;
alter table public.journal_days add column if not exists affirmation       text;
alter table public.journal_days add column if not exists excited_about     text;
alter table public.journal_days add column if not exists look_forward      text;
alter table public.journal_days add column if not exists notes             text;
alter table public.journal_days add column if not exists pen_data          jsonb default '{}';
alter table public.journal_days add column if not exists updated_at        timestamptz;

-- ── Journal — weekly reviews ──────────────────────────────────
create table if not exists public.journal_weeks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  week_start  date not null,
  going_well  text,
  not_working text,
  improve_on  text,
  next_focus  text,
  lessons     text,
  gratitude   jsonb default '[]',
  highlights  jsonb default '[]',
  updated_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.journal_weeks add column if not exists going_well  text;
alter table public.journal_weeks add column if not exists not_working text;
alter table public.journal_weeks add column if not exists improve_on  text;
alter table public.journal_weeks add column if not exists next_focus  text;
alter table public.journal_weeks add column if not exists lessons     text;
alter table public.journal_weeks add column if not exists gratitude   jsonb default '[]';
alter table public.journal_weeks add column if not exists highlights  jsonb default '[]';
alter table public.journal_weeks add column if not exists updated_at  timestamptz;

-- ── Journal — quarterly reviews ───────────────────────────────
create table if not exists public.journal_quarterly_reviews (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  quarter      text not null,
  theme        text,
  goals        jsonb default '[]',
  wins         jsonb default '[]',
  challenges   jsonb default '[]',
  learnings    jsonb default '[]',
  next_quarter jsonb default '[]',
  updated_at   timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, quarter)
);

alter table public.journal_quarterly_reviews add column if not exists theme        text;
alter table public.journal_quarterly_reviews add column if not exists goals        jsonb default '[]';
alter table public.journal_quarterly_reviews add column if not exists wins         jsonb default '[]';
alter table public.journal_quarterly_reviews add column if not exists challenges   jsonb default '[]';
alter table public.journal_quarterly_reviews add column if not exists learnings    jsonb default '[]';
alter table public.journal_quarterly_reviews add column if not exists next_quarter jsonb default '[]';
alter table public.journal_quarterly_reviews add column if not exists updated_at   timestamptz;

-- ── Journal — monthly reviews ─────────────────────────────────
create table if not exists public.journal_monthly_reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  month       text not null,
  highlights  jsonb default '[]',
  lessons     text,
  next_month  text,
  updated_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, month)
);

alter table public.journal_monthly_reviews add column if not exists highlights jsonb default '[]';
alter table public.journal_monthly_reviews add column if not exists lessons     text;
alter table public.journal_monthly_reviews add column if not exists next_month  text;
alter table public.journal_monthly_reviews add column if not exists updated_at  timestamptz;

-- ── Journal — month at a glance ───────────────────────────────
create table if not exists public.journal_monthly_glance (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  month       text not null,
  note        text,
  pen_data    jsonb default '{}',
  updated_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, month)
);

alter table public.journal_monthly_glance add column if not exists note       text;
alter table public.journal_monthly_glance add column if not exists pen_data   jsonb default '{}';
alter table public.journal_monthly_glance add column if not exists updated_at timestamptz;

-- ══════════════════════════════════════════════════════════════
-- Row Level Security
-- Enable RLS on every table and add user-scoped policies.
-- Safe to run if RLS is already on — the CREATE POLICY calls will
-- error on duplicate names; wrap in DO blocks to ignore those.
-- ══════════════════════════════════════════════════════════════

alter table public.routines                  enable row level security;
alter table public.routine_logs              enable row level security;
alter table public.journal_days              enable row level security;
alter table public.journal_weeks             enable row level security;
alter table public.journal_quarterly_reviews enable row level security;
alter table public.journal_monthly_reviews   enable row level security;
alter table public.journal_monthly_glance    enable row level security;

do $$ begin
  create policy "own routines"        on public.routines                  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy "own routine_logs"    on public.routine_logs              for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy "own journal_days"    on public.journal_days              for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy "own journal_weeks"   on public.journal_weeks             for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy "own journal_qr"      on public.journal_quarterly_reviews for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy "own journal_mr"      on public.journal_monthly_reviews   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy "own journal_mg"      on public.journal_monthly_glance    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- ── Indexes ───────────────────────────────────────────────────
create index if not exists idx_routines_user            on public.routines(user_id);
create index if not exists idx_routine_logs_user        on public.routine_logs(user_id);
create index if not exists idx_routine_logs_routine     on public.routine_logs(routine_id);
create index if not exists idx_journal_days_user_date   on public.journal_days(user_id, entry_date);
create index if not exists idx_journal_weeks_user       on public.journal_weeks(user_id, week_start);
create index if not exists idx_journal_qr_user          on public.journal_quarterly_reviews(user_id, quarter);
create index if not exists idx_journal_mr_user          on public.journal_monthly_reviews(user_id, month);
create index if not exists idx_journal_mg_user          on public.journal_monthly_glance(user_id, month);

-- ── Device usage sync (cross-device screen time) ─────────────
create table if not exists public.device_usage_sync (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  device_id    text not null,
  package_name text not null,
  app_name     text,
  date         date not null,
  minutes      bigint not null default 0,
  updated_at   timestamptz not null default now(),
  unique (user_id, device_id, package_name, date)
);
alter table public.device_usage_sync add column if not exists app_name text;
alter table public.device_usage_sync enable row level security;
do $$ begin
  create policy "own device_usage_sync" on public.device_usage_sync
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
create index if not exists idx_device_usage_sync_user_date
  on public.device_usage_sync(user_id, date);
