CREATE TABLE public.memories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  storage_path TEXT NOT NULL,
  caption TEXT NOT NULL CHECK (char_length(trim(caption)) BETWEEN 1 AND 160),
  added_by TEXT CHECK (added_by IS NULL OR char_length(added_by) <= 60),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.memories TO anon;
GRANT SELECT, INSERT ON public.memories TO authenticated;
GRANT ALL ON public.memories TO service_role;

ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view memories"
  ON public.memories FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can add a memory"
  ON public.memories FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);