-- Ensure guestbook_entries table exists and is secured
create table if not exists public.guestbook_entries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  relationship text,
  message text not null,
  approved boolean not null default true,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.guestbook_entries enable row level security;

-- Allow anonymous visitors to submit messages
create policy "Allow anonymous inserts to guestbook_entries"
  on public.guestbook_entries
  for insert
  to anon, authenticated
  with check (true);

-- Allow service role full access for private server functions and admin moderation
create policy "Allow service_role full management"
  on public.guestbook_entries
  for all
  using (true)
  with check (true);
