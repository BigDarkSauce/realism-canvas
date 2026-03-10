
-- 1. App settings table for library password (server-side storage)
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all direct access" ON public.app_settings FOR ALL USING (false) WITH CHECK (false);

-- RPC: check if library password exists
CREATE OR REPLACE FUNCTION public.rpc_has_library_password()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM app_settings WHERE key = 'library_password_hash');
END;
$$;

-- RPC: set library password hash
CREATE OR REPLACE FUNCTION public.rpc_set_library_password(p_hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF length(p_hash) != 64 THEN
    RAISE EXCEPTION 'Invalid hash format';
  END IF;
  INSERT INTO app_settings (key, value) VALUES ('library_password_hash', p_hash)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
END;
$$;

-- RPC: verify library password hash
CREATE OR REPLACE FUNCTION public.rpc_verify_library_password(p_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored text;
BEGIN
  SELECT value INTO v_stored FROM app_settings WHERE key = 'library_password_hash';
  IF v_stored IS NULL THEN RETURN false; END IF;
  RETURN v_stored = p_hash;
END;
$$;

-- 2. Tighten storage policies: drop overly permissive ones, add restricted ones
DROP POLICY IF EXISTS "Public upload access for canvas files" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update on canvas-files" ON storage.objects;
DROP POLICY IF EXISTS "Public delete access for canvas files" ON storage.objects;

-- Restricted upload: only allowed file types, path length limit
CREATE POLICY "Restricted upload canvas-files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'canvas-files'
  AND length(name) < 500
  AND name ~ '\.(png|jpg|jpeg|gif|webp|svg|pdf|html|htm|mp4|webm|mp3|ogg|wav)$'
);

-- Restricted update: only HTML files (used by HTML editor)
CREATE POLICY "Restricted update canvas-files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'canvas-files'
  AND name ~ '\.(html|htm)$'
)
WITH CHECK (
  bucket_id = 'canvas-files'
  AND name ~ '\.(html|htm)$'
);
