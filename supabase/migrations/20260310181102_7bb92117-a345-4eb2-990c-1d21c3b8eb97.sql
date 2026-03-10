
-- Drop the non-functional signed URL RPC 
DROP FUNCTION IF EXISTS public.rpc_create_signed_url(text, text, int);

-- Re-add SELECT policy for storage (needed for signed URL creation via service role in edge function)
-- Anon users still can't read directly since bucket is private
