const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured')

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured')

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { email, resetUrl, mode } = await req.json()
    const resetMode: 'account' | 'library' = mode === 'library' ? 'library' : 'account'
    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ error: 'Email required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Generate a secure reset token
    const token = crypto.randomUUID() + '-' + crypto.randomUUID()
    const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    // Store token in DB
    const { data: found, error: tokenError } = await supabase.rpc('rpc_set_reset_token', {
      p_email: email,
      p_token: token,
      p_expires: expires.toISOString(),
    })

    if (tokenError || !found) {
      // Don't reveal if email exists or not
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build reset link (include mode so reset page knows which password to update)
    const link = `${resetUrl}?token=${encodeURIComponent(token)}&mode=${resetMode}`

    const subject = resetMode === 'library' ? 'Reset Your Library Password' : 'Reset Your Sign-In Password'
    const heading = resetMode === 'library' ? 'Reset Your Library Password' : 'Reset Your Sign-In Password'
    const intro = resetMode === 'library'
      ? 'You requested a reset for your <strong>library password</strong> — the password used to unlock your library after signing in. Click the button below to set a new one. Your sign-in (account) password and your existing files and folders will remain unchanged.'
      : 'You requested a reset for your <strong>sign-in (account) password</strong>. Click the button below to set a new one. Your library password and your existing files and folders will remain unchanged.'

    // Send email via Resend gateway
    const emailRes = await fetch(`${GATEWAY_URL}/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: 'Canvas App <onboarding@resend.dev>',
        to: [email],
        subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
            <h2 style="color: #1a1a1a; margin-bottom: 16px;">${heading}</h2>
            <p style="color: #555; line-height: 1.6;">${intro}</p>
            <a href="${link}" style="display: inline-block; background: #000; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; margin: 24px 0; font-weight: 600;">
              Reset Password
            </a>
            <p style="color: #999; font-size: 13px; margin-top: 24px;">
              This link expires in 1 hour. If you didn't request this, ignore this email.
            </p>
          </div>
        `,
      }),
    })

    if (!emailRes.ok) {
      const errBody = await emailRes.text()
      console.error('Resend error:', emailRes.status, errBody)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
