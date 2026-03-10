import { supabase } from '@/integrations/supabase/client';

// In-memory cache for signed URLs with 50min TTL (URLs expire at 1h)
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutes

/**
 * Upload a file to canvas-files bucket and return a signed URL.
 * The bucket is private, so we use an edge function to generate signed URLs.
 */
export async function uploadAndGetSignedUrl(file: File, pathPrefix: string = ''): Promise<{ path: string; signedUrl: string }> {
  const ext = file.name.split('.').pop() || 'bin';
  const path = `${pathPrefix}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  
  const { error } = await supabase.storage.from('canvas-files').upload(path, file);
  if (error) throw error;

  const signedUrl = await getSignedUrl(path);
  return { path, signedUrl };
}

/**
 * Get a signed URL for a file in canvas-files bucket.
 * Results are cached in memory to avoid redundant edge function calls.
 */
export async function getSignedUrl(path: string): Promise<string> {
  const cached = signedUrlCache.get(path);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.url;
  }

  const { data, error } = await supabase.functions.invoke('signed-url', {
    body: { path },
  });
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Failed to get signed URL');
  }

  signedUrlCache.set(path, {
    url: data.signedUrl,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

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

/**
 * Batch get signed URLs for multiple paths (parallel).
 */
export async function getSignedUrls(paths: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const uncached: string[] = [];

  for (const path of paths) {
    const cached = signedUrlCache.get(path);
    if (cached && Date.now() < cached.expiresAt) {
      results.set(path, cached.url);
    } else {
      uncached.push(path);
    }
  }

  if (uncached.length > 0) {
    const promises = uncached.map(async (path) => {
      try {
        const url = await getSignedUrl(path);
        results.set(path, url);
      } catch {
        // Skip failed URLs
      }
    });
    await Promise.all(promises);
  }

  return results;
}
