const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Simple in-memory rate limiter
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

/** Timing-safe string comparison */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode('hmac-key-for-comparison');
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigA = await crypto.subtle.sign('HMAC', key, encoder.encode(a));
  const sigB = await crypto.subtle.sign('HMAC', key, encoder.encode(b));
  const arrA = new Uint8Array(sigA);
  const arrB = new Uint8Array(sigB);
  if (arrA.length !== arrB.length) return false;
  let result = 0;
  for (let i = 0; i < arrA.length; i++) {
    result |= arrA[i] ^ arrB[i];
  }
  return result === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting by IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               req.headers.get('cf-connecting-ip') || 'unknown';
    if (isRateLimited(ip)) {
      return new Response(JSON.stringify({ error: 'Too many attempts. Try again later.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { password } = await req.json();
    if (!password || typeof password !== 'string') {
      return new Response(JSON.stringify({ valid: false }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const appPassword = Deno.env.get('APP_PASSWORD');
    if (!appPassword) {
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const valid = await timingSafeEqual(password, appPassword);
    return new Response(JSON.stringify({ valid }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ valid: false }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
