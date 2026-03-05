
CREATE TABLE public.canvas_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Untitled',
  canvas_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.canvas_saves ENABLE ROW LEVEL SECURITY;

-- Public access (no auth required for this app)
CREATE POLICY "Anyone can read canvas saves" ON public.canvas_saves FOR SELECT USING (true);
CREATE POLICY "Anyone can insert canvas saves" ON public.canvas_saves FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete canvas saves" ON public.canvas_saves FOR DELETE USING (true);
