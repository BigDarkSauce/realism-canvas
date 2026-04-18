import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const path: unknown = body?.path;
    const docId: unknown = body?.docId;
    const accessKey: unknown = body?.accessKey;

    if (typeof path !== 'string' || path.length === 0 || path.length > 500) {
      return new Response(JSON.stringify({ error: 'Invalid path' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (typeof docId !== 'string' || !UUID_RE.test(docId)) {
      return new Response(JSON.stringify({ error: 'Invalid docId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (typeof accessKey !== 'string' || accessKey.length === 0 || accessKey.length > 256) {
      return new Response(JSON.stringify({ error: 'Invalid accessKey' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify the caller knows the document's access key. This proves they
    // are an authorized reader of the document and gates access to its files.
    const { data: ok, error: verifyErr } = await supabase.rpc('rpc_get_document_data', {
      p_doc_id: docId,
      p_access_key: accessKey,
    });
    if (verifyErr || ok === null) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // For new uploads we prefix paths with `${docId}/` for strong binding.
    // If the path uses that scheme, enforce it matches the verified docId.
    const firstSeg = path.split('/')[0];
    if (UUID_RE.test(firstSeg) && firstSeg.toLowerCase() !== docId.toLowerCase()) {
      return new Response(JSON.stringify({ error: 'Path does not belong to document' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data, error } = await supabase.storage
      .from('canvas-files')
      .createSignedUrl(path, 3600);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ signedUrl: data.signedUrl }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Bad request' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
