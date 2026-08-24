CREATE POLICY "Anyone can view memory photos"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'memories');
