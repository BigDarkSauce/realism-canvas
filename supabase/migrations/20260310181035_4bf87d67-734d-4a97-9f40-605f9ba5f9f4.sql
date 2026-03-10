
-- 1. Drop old 2-arg rpc_update_document_data that bypasses access key
DROP FUNCTION IF EXISTS public.rpc_update_document_data(uuid, jsonb);

-- 2. Add access_key param to rpc_get_document_data
CREATE OR REPLACE FUNCTION public.rpc_get_document_data(p_doc_id uuid, p_access_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data jsonb;
  v_key text;
BEGIN
  SELECT canvas_data, access_key INTO v_data, v_key FROM canvas_documents WHERE id = p_doc_id;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;
  IF v_key != p_access_key THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN v_data;
END;
$$;

-- Drop old no-arg version of rpc_get_document_data
DROP FUNCTION IF EXISTS public.rpc_get_document_data(uuid);

-- 3. Lock down canvas_saves: deny all direct access
DROP POLICY IF EXISTS "Anyone can delete canvas saves" ON public.canvas_saves;
DROP POLICY IF EXISTS "Anyone can insert canvas saves" ON public.canvas_saves;
DROP POLICY IF EXISTS "Anyone can read canvas saves" ON public.canvas_saves;
DROP POLICY IF EXISTS "Anyone can update canvas saves" ON public.canvas_saves;

CREATE POLICY "Deny all direct access on canvas_saves" ON public.canvas_saves
  AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- 4. Lock down save_folders: deny all direct access
DROP POLICY IF EXISTS "Anyone can delete folders" ON public.save_folders;
DROP POLICY IF EXISTS "Anyone can insert folders" ON public.save_folders;
DROP POLICY IF EXISTS "Anyone can read folders" ON public.save_folders;
DROP POLICY IF EXISTS "Anyone can update folders" ON public.save_folders;

CREATE POLICY "Deny all direct access on save_folders" ON public.save_folders
  AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- 5. RPC: list saves for a document (requires access_key)
CREATE OR REPLACE FUNCTION public.rpc_list_saves(p_doc_id uuid, p_access_key text)
RETURNS TABLE(id uuid, name text, canvas_data jsonb, created_at timestamptz, folder_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM canvas_documents WHERE canvas_documents.id = p_doc_id AND access_key = p_access_key) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY SELECT s.id, s.name, s.canvas_data, s.created_at, s.folder_id
    FROM canvas_saves s WHERE s.document_id = p_doc_id ORDER BY s.created_at DESC;
END;
$$;

-- 6. RPC: create a save
CREATE OR REPLACE FUNCTION public.rpc_create_save(p_doc_id uuid, p_access_key text, p_name text, p_canvas_data jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM canvas_documents WHERE id = p_doc_id AND access_key = p_access_key) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  INSERT INTO canvas_saves (name, canvas_data, document_id) VALUES (p_name, p_canvas_data, p_doc_id)
  RETURNING canvas_saves.id INTO v_id;
  RETURN v_id;
END;
$$;

-- 7. RPC: delete a save
CREATE OR REPLACE FUNCTION public.rpc_delete_save(p_save_id uuid, p_access_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM canvas_saves s JOIN canvas_documents d ON d.id = s.document_id
    WHERE s.id = p_save_id AND d.access_key = p_access_key
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  DELETE FROM canvas_saves WHERE id = p_save_id;
END;
$$;

-- 8. RPC: move save to folder
CREATE OR REPLACE FUNCTION public.rpc_move_save(p_save_id uuid, p_access_key text, p_folder_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM canvas_saves s JOIN canvas_documents d ON d.id = s.document_id
    WHERE s.id = p_save_id AND d.access_key = p_access_key
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE canvas_saves SET folder_id = p_folder_id WHERE id = p_save_id;
END;
$$;

-- 9. RPC: list folders for a document
CREATE OR REPLACE FUNCTION public.rpc_list_folders(p_doc_id uuid, p_access_key text)
RETURNS TABLE(id uuid, name text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM canvas_documents WHERE canvas_documents.id = p_doc_id AND access_key = p_access_key) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY SELECT f.id, f.name, f.created_at
    FROM save_folders f WHERE f.document_id = p_doc_id ORDER BY f.created_at ASC;
END;
$$;

-- 10. RPC: create folder
CREATE OR REPLACE FUNCTION public.rpc_create_folder(p_doc_id uuid, p_access_key text, p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM canvas_documents WHERE id = p_doc_id AND access_key = p_access_key) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  INSERT INTO save_folders (name, document_id) VALUES (p_name, p_doc_id)
  RETURNING save_folders.id INTO v_id;
  RETURN v_id;
END;
$$;

-- 11. RPC: rename folder
CREATE OR REPLACE FUNCTION public.rpc_rename_folder(p_folder_id uuid, p_access_key text, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM save_folders f JOIN canvas_documents d ON d.id = f.document_id
    WHERE f.id = p_folder_id AND d.access_key = p_access_key
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE save_folders SET name = p_name WHERE id = p_folder_id;
END;
$$;

-- 12. RPC: delete folder (unassign saves first)
CREATE OR REPLACE FUNCTION public.rpc_delete_folder(p_folder_id uuid, p_access_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM save_folders f JOIN canvas_documents d ON d.id = f.document_id
    WHERE f.id = p_folder_id AND d.access_key = p_access_key
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE canvas_saves SET folder_id = NULL WHERE folder_id = p_folder_id;
  DELETE FROM save_folders WHERE id = p_folder_id;
END;
$$;

-- 13. RPC: upsert save (for imports)
CREATE OR REPLACE FUNCTION public.rpc_upsert_save(p_access_key text, p_id uuid, p_name text, p_canvas_data jsonb, p_document_id uuid, p_folder_id uuid DEFAULT NULL, p_created_at timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM canvas_documents WHERE id = p_document_id AND access_key = p_access_key) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  INSERT INTO canvas_saves (id, name, canvas_data, document_id, folder_id, created_at)
  VALUES (p_id, p_name, p_canvas_data, p_document_id, p_folder_id, p_created_at)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, canvas_data = EXCLUDED.canvas_data, folder_id = EXCLUDED.folder_id;
END;
$$;

-- 14. RPC: upsert folder (for imports)
CREATE OR REPLACE FUNCTION public.rpc_upsert_folder(p_access_key text, p_id uuid, p_name text, p_document_id uuid, p_created_at timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM canvas_documents WHERE id = p_document_id AND access_key = p_access_key) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  INSERT INTO save_folders (id, name, document_id, created_at)
  VALUES (p_id, p_name, p_document_id, p_created_at)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
END;
$$;

-- 15. RPC: export saves for specific document IDs
CREATE OR REPLACE FUNCTION public.rpc_export_saves(p_doc_ids uuid[])
RETURNS TABLE(id uuid, name text, canvas_data jsonb, created_at timestamptz, document_id uuid, folder_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT s.id, s.name, s.canvas_data, s.created_at, s.document_id, s.folder_id
    FROM canvas_saves s WHERE s.document_id = ANY(p_doc_ids);
END;
$$;

-- 16. RPC: export folders for specific document IDs
CREATE OR REPLACE FUNCTION public.rpc_export_folders(p_doc_ids uuid[])
RETURNS TABLE(id uuid, name text, created_at timestamptz, document_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT f.id, f.name, f.created_at, f.document_id
    FROM save_folders f WHERE f.document_id = ANY(p_doc_ids);
END;
$$;

-- 17. Make canvas-files bucket private
UPDATE storage.buckets SET public = false WHERE id = 'canvas-files';

-- 18. Drop the public read policy
DROP POLICY IF EXISTS "Public read access for canvas files" ON storage.objects;

-- 19. Create signed URL RPC
CREATE OR REPLACE FUNCTION public.rpc_create_signed_url(p_bucket text, p_path text, p_expires_in int DEFAULT 3600)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_url text;
BEGIN
  -- Only allow canvas-files bucket
  IF p_bucket != 'canvas-files' THEN
    RAISE EXCEPTION 'Invalid bucket';
  END IF;
  SELECT storage.foldername(p_path) INTO v_url; -- validate path exists
  -- Use storage API to create signed URL
  SELECT (storage.create_signed_url(p_bucket, p_path, p_expires_in))::text INTO v_url;
  RETURN v_url;
END;
$$;
