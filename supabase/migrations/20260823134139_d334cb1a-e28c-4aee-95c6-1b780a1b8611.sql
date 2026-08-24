CREATE POLICY "Anyone can upload a memory photo"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'memories');