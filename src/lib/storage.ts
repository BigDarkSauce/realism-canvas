import { supabase } from '@/integrations/supabase/client';

// In-memory cache for signed URLs with 50min TTL (URLs expire at 1h)
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const CACHE_TTL_MS = 50 * 60 * 1000;

function getDocAccessKey(docId: string): string {
  return sessionStorage.getItem(`doc_key_${docId}`) || '';
}

/**
 * Upload a file to canvas-files via the upload-file edge function. The bucket
 * is private and direct uploads are denied; the edge function verifies the
 * caller's document access key before writing.
 */
export async function uploadAndGetSignedUrl(
  file: File,
  pathPrefix: string = '',
  docIdArg?: string,
): Promise<{ path: string; signedUrl: string }> {
  const docId = docIdArg || sessionStorage.getItem('current_doc_id') || '';
  const accessKey = docId ? getDocAccessKey(docId) : '';
  if (!docId || !accessKey) {
    throw new Error('Upload requires an authenticated document context');
  }

  const form = new FormData();
  form.append('file', file);
  form.append('docId', docId);
  form.append('accessKey', accessKey);
  if (pathPrefix) form.append('pathPrefix', pathPrefix);

  const { data, error } = await supabase.functions.invoke('upload-file', { body: form });
  if (error || !data?.path || !data?.signedUrl) {
    throw new Error(error?.message || 'Failed to upload file');
  }

  signedUrlCache.set(data.path, { url: data.signedUrl, expiresAt: Date.now() + CACHE_TTL_MS });
  return { path: data.path, signedUrl: data.signedUrl };
}

/**
 * Get a signed URL for a file in canvas-files. Requires the active document's
 * access key so the edge function can verify authorization.
 */
export async function getSignedUrl(path: string, docIdArg?: string): Promise<string> {
  const cached = signedUrlCache.get(path);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.url;
  }

  // If the path embeds the doc UUID prefix, prefer that.
  const firstSeg = path.split('/')[0];
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(firstSeg);
  const docId = docIdArg || (isUuid ? firstSeg : sessionStorage.getItem('current_doc_id') || '');
  const accessKey = docId ? getDocAccessKey(docId) : '';
  if (!docId || !accessKey) {
    throw new Error('Signed URL requires an authenticated document context');
  }

  const { data, error } = await supabase.functions.invoke('signed-url', {
    body: { path, docId, accessKey },
  });
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Failed to get signed URL');
  }

  signedUrlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + CACHE_TTL_MS });
  return data.signedUrl;
}

/**
 * Extract the storage path from a Supabase storage URL (public or signed).
 */
export function extractStoragePath(url: string): string | null {
  try {
    const match = url.match(/\/canvas-files\/(.+?)(\?|$)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export async function getSignedUrls(paths: string[], docIdArg?: string): Promise<Map<string, string>> {
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
        const url = await getSignedUrl(path, docIdArg);
        results.set(path, url);
      } catch {
        // Skip failed URLs
      }
    });
    await Promise.all(promises);
  }

  return results;
}
