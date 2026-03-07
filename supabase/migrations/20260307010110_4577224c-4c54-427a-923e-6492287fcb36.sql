
-- Create canvas_documents table
CREATE TABLE public.canvas_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  access_key text NOT NULL,
  canvas_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(name)
);

ALTER TABLE public.canvas_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read documents" ON public.canvas_documents FOR SELECT USING (true);
CREATE POLICY "Anyone can insert documents" ON public.canvas_documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update documents" ON public.canvas_documents FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete documents" ON public.canvas_documents FOR DELETE USING (true);

-- Create save_folders table
CREATE TABLE public.save_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.canvas_documents(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled Folder',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.save_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read folders" ON public.save_folders FOR SELECT USING (true);
CREATE POLICY "Anyone can insert folders" ON public.save_folders FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update folders" ON public.save_folders FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete folders" ON public.save_folders FOR DELETE USING (true);

-- Add document_id and folder_id to canvas_saves
ALTER TABLE public.canvas_saves ADD COLUMN document_id uuid REFERENCES public.canvas_documents(id) ON DELETE CASCADE;
ALTER TABLE public.canvas_saves ADD COLUMN folder_id uuid REFERENCES public.save_folders(id) ON DELETE SET NULL;

-- Allow updates on canvas_saves
CREATE POLICY "Anyone can update canvas saves" ON public.canvas_saves FOR UPDATE USING (true) WITH CHECK (true);
