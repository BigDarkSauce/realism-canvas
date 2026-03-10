
-- Fix 1: rpc_update_document_data requires access_key verification
CREATE OR REPLACE FUNCTION public.rpc_update_document_data(p_doc_id uuid, p_access_key text, p_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_key text;
BEGIN
  SELECT access_key INTO v_existing_key FROM canvas_documents WHERE id = p_doc_id;
  IF v_existing_key IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;
  IF v_existing_key != p_access_key THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE canvas_documents SET canvas_data = p_data WHERE id = p_doc_id;
END;
$$;

-- Fix 2: rpc_upsert_document verifies access_key for existing docs, does NOT update access_key
CREATE OR REPLACE FUNCTION public.rpc_upsert_document(p_id uuid, p_name text, p_access_key text, p_canvas_data jsonb, p_created_at timestamp with time zone)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_key text;
BEGIN
  SELECT access_key INTO v_existing_key FROM canvas_documents WHERE id = p_id;
  IF v_existing_key IS NOT NULL AND v_existing_key != p_access_key THEN
    RAISE EXCEPTION 'Access denied: incorrect access key for existing document';
  END IF;
  INSERT INTO canvas_documents (id, name, access_key, canvas_data, created_at)
  VALUES (p_id, p_name, p_access_key, p_canvas_data, p_created_at)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    canvas_data = EXCLUDED.canvas_data,
    created_at = EXCLUDED.created_at;
END;
$$;

-- Fix 3: rpc_export_documents scoped to caller-specified IDs only
CREATE OR REPLACE FUNCTION public.rpc_export_documents(p_doc_ids uuid[])
RETURNS TABLE(id uuid, name text, canvas_data jsonb, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT d.id, d.name, d.canvas_data, d.created_at
    FROM canvas_documents d
    WHERE d.id = ANY(p_doc_ids);
END;
$$;

-- Drop old no-arg version
DROP FUNCTION IF EXISTS public.rpc_export_documents();
