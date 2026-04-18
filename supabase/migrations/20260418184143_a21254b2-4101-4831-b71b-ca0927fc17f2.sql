
-- 1. Convert permissive deny policies to RESTRICTIVE on sensitive tables
DROP POLICY IF EXISTS "Deny all direct access" ON public.library_accounts;
CREATE POLICY "Deny all direct access (restrictive)"
  ON public.library_accounts AS RESTRICTIVE
  FOR ALL TO public
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Deny all direct access" ON public.app_settings;
CREATE POLICY "Deny all direct access (restrictive)"
  ON public.app_settings AS RESTRICTIVE
  FOR ALL TO public
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Deny direct select" ON public.canvas_documents;
DROP POLICY IF EXISTS "Deny direct insert" ON public.canvas_documents;
DROP POLICY IF EXISTS "Deny direct update" ON public.canvas_documents;
DROP POLICY IF EXISTS "Deny direct delete" ON public.canvas_documents;
CREATE POLICY "Deny all direct access (restrictive)"
  ON public.canvas_documents AS RESTRICTIVE
  FOR ALL TO public
  USING (false) WITH CHECK (false);

-- 2. Update export RPCs to require access keys (zip with doc IDs)
CREATE OR REPLACE FUNCTION public.rpc_export_documents(p_doc_ids uuid[], p_access_keys text[])
 RETURNS TABLE(id uuid, name text, canvas_data jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE i int;
BEGIN
  IF p_doc_ids IS NULL OR p_access_keys IS NULL OR array_length(p_doc_ids,1) IS DISTINCT FROM array_length(p_access_keys,1) THEN
    RAISE EXCEPTION 'doc_ids and access_keys must be same length';
  END IF;
  FOR i IN 1..array_length(p_doc_ids,1) LOOP
    IF NOT EXISTS (SELECT 1 FROM canvas_documents d WHERE d.id = p_doc_ids[i] AND d.access_key = p_access_keys[i]) THEN
      RAISE EXCEPTION 'Access denied for document %', p_doc_ids[i];
    END IF;
  END LOOP;
  RETURN QUERY SELECT d.id, d.name, d.canvas_data, d.created_at
    FROM canvas_documents d WHERE d.id = ANY(p_doc_ids);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_export_saves(p_doc_ids uuid[], p_access_keys text[])
 RETURNS TABLE(id uuid, name text, canvas_data jsonb, created_at timestamp with time zone, document_id uuid, folder_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE i int;
BEGIN
  IF p_doc_ids IS NULL OR p_access_keys IS NULL OR array_length(p_doc_ids,1) IS DISTINCT FROM array_length(p_access_keys,1) THEN
    RAISE EXCEPTION 'doc_ids and access_keys must be same length';
  END IF;
  FOR i IN 1..array_length(p_doc_ids,1) LOOP
    IF NOT EXISTS (SELECT 1 FROM canvas_documents d WHERE d.id = p_doc_ids[i] AND d.access_key = p_access_keys[i]) THEN
      RAISE EXCEPTION 'Access denied for document %', p_doc_ids[i];
    END IF;
  END LOOP;
  RETURN QUERY SELECT s.id, s.name, s.canvas_data, s.created_at, s.document_id, s.folder_id
    FROM canvas_saves s WHERE s.document_id = ANY(p_doc_ids);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_export_folders(p_doc_ids uuid[], p_access_keys text[])
 RETURNS TABLE(id uuid, name text, created_at timestamp with time zone, document_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE i int;
BEGIN
  IF p_doc_ids IS NULL OR p_access_keys IS NULL OR array_length(p_doc_ids,1) IS DISTINCT FROM array_length(p_access_keys,1) THEN
    RAISE EXCEPTION 'doc_ids and access_keys must be same length';
  END IF;
  FOR i IN 1..array_length(p_doc_ids,1) LOOP
    IF NOT EXISTS (SELECT 1 FROM canvas_documents d WHERE d.id = p_doc_ids[i] AND d.access_key = p_access_keys[i]) THEN
      RAISE EXCEPTION 'Access denied for document %', p_doc_ids[i];
    END IF;
  END LOOP;
  RETURN QUERY SELECT f.id, f.name, f.created_at, f.document_id
    FROM save_folders f WHERE f.document_id = ANY(p_doc_ids);
END;
$function$;

-- Drop old single-arg versions to remove the bypass
DROP FUNCTION IF EXISTS public.rpc_export_documents(uuid[]);
DROP FUNCTION IF EXISTS public.rpc_export_saves(uuid[]);
DROP FUNCTION IF EXISTS public.rpc_export_folders(uuid[]);

-- 3. Storage: remove anon insert; uploads must go through edge function (service role)
DROP POLICY IF EXISTS "Allow public insert on canvas-files" ON storage.objects;
DROP POLICY IF EXISTS "Restricted upload canvas-files" ON storage.objects;
DROP POLICY IF EXISTS "Restricted update canvas-files" ON storage.objects;

-- Add restrictive deny so only service_role (which bypasses RLS) can write
CREATE POLICY "Deny direct write canvas-files" ON storage.objects
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (bucket_id <> 'canvas-files');
CREATE POLICY "Deny direct update canvas-files" ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO public
  USING (bucket_id <> 'canvas-files') WITH CHECK (bucket_id <> 'canvas-files');
CREATE POLICY "Deny direct delete canvas-files" ON storage.objects
  AS RESTRICTIVE FOR DELETE TO public
  USING (bucket_id <> 'canvas-files');
