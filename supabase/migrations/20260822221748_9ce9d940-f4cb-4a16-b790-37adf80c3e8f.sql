CREATE TABLE public.guestbook_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 60),
  relationship TEXT CHECK (relationship IS NULL OR char_length(relationship) <= 60),
  message TEXT NOT NULL CHECK (char_length(trim(message)) BETWEEN 1 AND 500),
  approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.guestbook_entries TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guestbook_entries TO authenticated;
GRANT ALL ON public.guestbook_entries TO service_role;

ALTER TABLE public.guestbook_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read approved entries"
  ON public.guestbook_entries FOR SELECT
  TO anon, authenticated
  USING (approved = true);

CREATE POLICY "Anyone can submit an entry"
  ON public.guestbook_entries FOR INSERT
  TO anon, authenticated
  WITH CHECK (approved = false);