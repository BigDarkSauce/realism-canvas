import { supabase } from '@/integrations/supabase/client';

/**
 * Upload a file to canvas-files bucket and return a signed URL.
 * The bucket is private, so we use an edge function to generate signed URLs.
 */
export async function uploadAndGetSignedUrl(file: File, pathPrefix: string = ''): Promise<{ path: string; signedUrl: string }> {
  const ext = file.name.split('.').pop() || 'bin';
  const path = `${pathPrefix}${Date.now()}.${ext}`;
  
  const { error } = await supabase.storage.from('canvas-files').upload(path, file);
  if (error) throw error;

  const signedUrl = await getSignedUrl(path);
  return { path, signedUrl };
}

/**
 * Get a signed URL for a file in canvas-files bucket.
 */
export async function getSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('signed-url', {
    body: { path },
  });
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Failed to get signed URL');
  }
  return data.signedUrl;
}

/**
 * Extract the storage path from a Supabase storage URL (public or signed).
 * Returns the path portion after /canvas-files/
 */
export function extractStoragePath(url: string): string | null {
  try {
    const match = url.match(/\/canvas-files\/(.+?)(\?|$)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}
