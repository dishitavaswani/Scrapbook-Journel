-- Add photo_storage_path column if it does not exist
ALTER TABLE public.guestbook_entries
  ADD COLUMN IF NOT EXISTS photo_storage_path text;

-- Drop any previous restrictive 500-character check constraint on message
ALTER TABLE public.guestbook_entries
  DROP CONSTRAINT IF EXISTS guestbook_entries_message_check;

-- Ensure message length constraint allows up to 10,000 characters
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'guestbook_entries_message_length'
  ) THEN
    ALTER TABLE public.guestbook_entries
      ADD CONSTRAINT guestbook_entries_message_length
      CHECK (char_length(trim(message)) BETWEEN 1 AND 10000);
  END IF;
END $$;

-- Create the guestbook-photos storage bucket and configure access
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'guestbook-photos',
  'guestbook-photos',
  true,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 8388608,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

-- Allow viewing images from the guestbook-photos bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Anyone can view guestbook photos'
  ) THEN
    CREATE POLICY "Anyone can view guestbook photos"
      ON storage.objects FOR SELECT
      TO anon, authenticated
      USING (bucket_id = 'guestbook-photos');
  END IF;
END $$;

-- Allow uploading images to the guestbook-photos bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Anyone can upload a guestbook photo'
  ) THEN
    CREATE POLICY "Anyone can upload a guestbook photo"
      ON storage.objects FOR INSERT
      TO anon, authenticated
      WITH CHECK (bucket_id = 'guestbook-photos');
  END IF;
END $$;

-- Allow deleting images from the guestbook-photos bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Anyone can delete guestbook photos'
  ) THEN
    CREATE POLICY "Anyone can delete guestbook photos"
      ON storage.objects FOR DELETE
      TO anon, authenticated
      USING (bucket_id = 'guestbook-photos');
  END IF;
END $$;
