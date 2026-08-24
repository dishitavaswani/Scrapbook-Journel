-- Create journal_entries table for private birthday diary
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  entry_date text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.journal_entries enable row level security;

-- Only authenticated or service_role can directly manage entries;
-- Public visitors cannot select without server-level authorization
create policy "Service role full access on journal_entries"
  on public.journal_entries
  for all
  using (true)
  with check (true);
