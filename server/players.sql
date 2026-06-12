-- Genies — Milestone 3: persistence
-- Run this in the Supabase SQL editor for your project.
-- Stores each player's position + inventory, keyed by a stable client id (pid).

create table if not exists public.players (
  pid         text primary key,
  name        text,
  x           int  default 0,
  y           int  default 0,
  inv         jsonb default '{}'::jsonb,   -- { "mana": 3, "herb": 1, "shard": 0 }
  updated_at  timestamptz default now()
);

-- Lock it down: enable RLS with NO public policies. The game server uses the
-- service-role key (which bypasses RLS), so only the server can read/write this
-- table — the public/anon key can't touch it. That's what keeps inventories from
-- being forged from the client.
alter table public.players enable row level security;
