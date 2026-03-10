
-- RPC: Create document (returns id)
CREATE OR REPLACE FUNCTION public.rpc_create_document(p_name text, p_access_key text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM canvas_documents WHERE name = p_name;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Document with this name already exists';
  END IF;
  INSERT INTO canvas_documents (name, access_key) VALUES (p_name, p_access_key)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- RPC: Verify document access (returns id or null)
CREATE OR REPLACE FUNCTION public.rpc_verify_document(p_name text, p_access_key text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM canvas_documents
  WHERE name = p_name AND access_key = p_access_key;
  RETURN v_id;
END;
$$;

-- RPC: Get document data (no access_key exposed)
CREATE OR REPLACE FUNCTION public.rpc_get_document_data(p_doc_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data jsonb;
BEGIN
  SELECT canvas_data INTO v_data FROM canvas_documents WHERE id = p_doc_id;
  RETURN v_data;
END;
$$;

-- RPC: Update document data
CREATE OR REPLACE FUNCTION public.rpc_update_document_data(p_doc_id uuid, p_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE canvas_documents SET canvas_data = p_data WHERE id = p_doc_id;
END;
$$;

-- RPC: Export all documents (without access_key)
CREATE OR REPLACE FUNCTION public.rpc_export_documents()
RETURNS TABLE(id uuid, name text, canvas_data jsonb, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT d.id, d.name, d.canvas_data, d.created_at FROM canvas_documents d;
END;
$$;

-- RPC: Upsert document for import
CREATE OR REPLACE FUNCTION public.rpc_upsert_document(p_id uuid, p_name text, p_access_key text, p_canvas_data jsonb, p_created_at timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO canvas_documents (id, name, access_key, canvas_data, created_at)
  VALUES (p_id, p_name, p_access_key, p_canvas_data, p_created_at)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    access_key = EXCLUDED.access_key,
    canvas_data = EXCLUDED.canvas_data,
    created_at = EXCLUDED.created_at;
END;
$$;

-- Drop open policies on canvas_documents
DROP POLICY IF EXISTS "Anyone can delete documents" ON canvas_documents;
DROP POLICY IF EXISTS "Anyone can insert documents" ON canvas_documents;
DROP POLICY IF EXISTS "Anyone can read documents" ON canvas_documents;
DROP POLICY IF EXISTS "Anyone can update documents" ON canvas_documents;

-- Deny all direct access to canvas_documents (RPCs use SECURITY DEFINER to bypass)
CREATE POLICY "Deny direct select" ON canvas_documents FOR SELECT TO public USING (false);
CREATE POLICY "Deny direct insert" ON canvas_documents FOR INSERT TO public WITH CHECK (false);
CREATE POLICY "Deny direct update" ON canvas_documents FOR UPDATE TO public USING (false) WITH CHECK (false);
CREATE POLICY "Deny direct delete" ON canvas_documents FOR DELETE TO public USING (false);
