-- Create the memories storage bucket and configure public access
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'memories',
  'memories',
  true,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 8388608,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/gif'];

-- Allow anyone to view images from the memories bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Anyone can view memory photos'
  ) THEN
    CREATE POLICY "Anyone can view memory photos"
      ON storage.objects FOR SELECT
      TO anon, authenticated
      USING (bucket_id = 'memories');
  END IF;
END $$;

-- Allow anyone to upload images to the memories bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Anyone can upload a memory photo'
  ) THEN
    CREATE POLICY "Anyone can upload a memory photo"
      ON storage.objects FOR INSERT
      TO anon, authenticated
      WITH CHECK (bucket_id = 'memories');
  END IF;
END $$;

-- Allow deleting images from the memories bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Anyone can delete memory photos'
  ) THEN
    CREATE POLICY "Anyone can delete memory photos"
      ON storage.objects FOR DELETE
      TO anon, authenticated
      USING (bucket_id = 'memories');
  END IF;
END $$;

-- Grant and allow DELETE on public.memories table
GRANT DELETE ON public.memories TO anon;
GRANT DELETE ON public.memories TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'memories' AND schemaname = 'public' AND policyname = 'Anyone can delete a memory'
  ) THEN
    CREATE POLICY "Anyone can delete a memory"
      ON public.memories FOR DELETE
      TO anon, authenticated
      USING (true);
  END IF;
END $$;
