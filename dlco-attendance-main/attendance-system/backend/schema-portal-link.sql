-- ─────────────────────────────────────────────────────────────
-- Teacher ↔ student portal link
-- Run once in Supabase → SQL Editor. Safe to re-run.
--
-- Moves the features that used to live only in one browser
-- (subjects, timetable, leave requests, warnings) into the
-- database, so what a teacher sets up is what students see,
-- and what students submit reaches the teacher.
--
-- `sid` columns hold students.id as text so this works whether
-- your students.id is a uuid or a number.
-- ─────────────────────────────────────────────────────────────

create table if not exists subjects (
  code    text primary key,
  name    text not null,
  short   text,
  teacher text,
  color   text default '#6D28D9'
);

create table if not exists timetable (
  cls    text not null,
  day    text not null check (day in ('Mon','Tue','Wed','Thu','Fri','Sat')),
  period int  not null check (period >= 0),
  code   text not null,
  room   text,
  primary key (cls, day, period)
);

create table if not exists leave_requests (
  id          uuid primary key default gen_random_uuid(),
  sid         text not null,
  type        text not null,
  from_date   date not null,
  to_date     date not null,
  days        int  not null,
  reason      text not null,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  note        text,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create index if not exists leave_requests_sid_idx on leave_requests (sid);

create table if not exists warnings (
  id         uuid primary key default gen_random_uuid(),
  sid        text not null,
  pct        int,
  message    text,
  created_at timestamptz not null default now()
);
create index if not exists warnings_sid_idx on warnings (sid);

-- The server talks to these tables with the service_role key, which bypasses RLS.
-- Turning RLS on with no policies blocks direct access with the public anon key.
alter table subjects       enable row level security;
alter table timetable      enable row level security;
alter table leave_requests enable row level security;
alter table warnings       enable row level security;
