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

/** Generate a cryptographic session token */
async function generateSessionToken(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const secret = Deno.env.get('APP_PASSWORD') || '';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = `session:${secret}:${timestamp}`;
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const token = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${timestamp}:${token}`;
}

/** Verify a session token is valid and not expired (24h) */
async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const [timestamp, sig] = token.split(':');
    if (!timestamp || !sig) return false;
    const ts = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - ts > 86400) return false; // 24 hour expiry

    const encoder = new TextEncoder();
    const secret = Deno.env.get('APP_PASSWORD') || '';
    const payload = `session:${secret}:${timestamp}`;
    const keyData = encoder.encode(secret);
    const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const expectedSig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const expectedHex = Array.from(new Uint8Array(expectedSig)).map(b => b.toString(16).padStart(2, '0')).join('');
    return await timingSafeEqual(sig, expectedHex);
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Token verification endpoint
    if (body.action === 'verify_token') {
      const token = body.token;
      if (!token || typeof token !== 'string') {
        return new Response(JSON.stringify({ valid: false }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const valid = await verifySessionToken(token);
      return new Response(JSON.stringify({ valid }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Password verification endpoint
    const { password } = body;

    // Rate limiting by IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               req.headers.get('cf-connecting-ip') || 'unknown';
    if (isRateLimited(ip)) {
      return new Response(JSON.stringify({ error: 'Too many attempts. Try again later.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
    if (valid) {
      const token = await generateSessionToken(password);
      return new Response(JSON.stringify({ valid: true, token }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ valid: false }), {
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
