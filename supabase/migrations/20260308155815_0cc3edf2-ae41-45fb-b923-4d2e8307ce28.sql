
CREATE POLICY "Allow public update on canvas-files"
ON storage.objects
FOR UPDATE
TO anon
USING (bucket_id = 'canvas-files')
WITH CHECK (bucket_id = 'canvas-files');

CREATE POLICY "Allow public insert on canvas-files"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'canvas-files');
