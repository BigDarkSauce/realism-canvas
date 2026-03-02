
-- Create storage bucket for canvas file uploads (public so files can be viewed inline)
INSERT INTO storage.buckets (id, name, public) VALUES ('canvas-files', 'canvas-files', true);

-- Allow anyone to read files (public bucket)
CREATE POLICY "Public read access for canvas files"
ON storage.objects FOR SELECT
USING (bucket_id = 'canvas-files');

-- Allow anyone to upload files (no auth required for this canvas app)
CREATE POLICY "Public upload access for canvas files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'canvas-files');

-- Allow anyone to delete their uploads
CREATE POLICY "Public delete access for canvas files"
ON storage.objects FOR DELETE
USING (bucket_id = 'canvas-files');
