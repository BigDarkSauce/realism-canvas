import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_EXT = /\.(png|jpg|jpeg|gif|webp|svg|pdf|html|htm|mp4|webm|mp3|ogg|wav|txt|md)$/i;
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const form = await req.formData();
    const file = form.get('file');
    const docId = String(form.get('docId') || '');
    const accessKey = String(form.get('accessKey') || '');
    const pathPrefix = String(form.get('pathPrefix') || '');

    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'Missing file' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!UUID_RE.test(docId)) {
      return new Response(JSON.stringify({ error: 'Invalid docId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!accessKey || accessKey.length > 256) {
      return new Response(JSON.stringify({ error: 'Invalid accessKey' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (file.size > MAX_BYTES) {
      return new Response(JSON.stringify({ error: 'File too large' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!ALLOWED_EXT.test(file.name)) {
      return new Response(JSON.stringify({ error: 'File type not allowed' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (pathPrefix.length > 100 || /\.\.|\//.test(pathPrefix.replace(/\/$/, ''))) {
      return new Response(JSON.stringify({ error: 'Invalid pathPrefix' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify ownership via the access-key gated RPC.
    const { data: ok, error: verifyErr } = await supabase.rpc('rpc_get_document_data', {
      p_doc_id: docId,
      p_access_key: accessKey,
    });
    if (verifyErr || ok === null) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const safePrefix = pathPrefix.replace(/[^a-zA-Z0-9_-]/g, '');
    const path = `${docId}/${safePrefix}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from('canvas-files')
      .upload(path, bytes, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from('canvas-files')
      .createSignedUrl(path, 3600);
    if (signErr) {
      return new Response(JSON.stringify({ error: signErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ path, signedUrl: signed.signedUrl }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Bad request' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
