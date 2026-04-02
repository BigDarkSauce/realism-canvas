import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

async function signPayload(secret: string, timestamp: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`));
  return Array.from(new Uint8Array(signature)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const WEASYPRINT_URL = Deno.env.get("WEASYPRINT_URL");
    const WEASYPRINT_SECRET = Deno.env.get("WEASYPRINT_SECRET");

    if (!WEASYPRINT_URL) {
      return new Response(
        JSON.stringify({ error: "WEASYPRINT_URL is not configured", fallback: true }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { html, filename } = await req.json();
    if (!html || typeof html !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'html' field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const pdfUrl = `${WEASYPRINT_URL.replace(/\/$/, "")}/pdf`;
    const sanitizedFilename = (filename || "export.pdf").replace(/"/g, "_");
    const body = JSON.stringify({ html });
    let timestamp: string | null = null;
    let signature: string | null = null;

    if (WEASYPRINT_SECRET) {
      timestamp = Math.floor(Date.now() / 1000).toString();
      signature = await signPayload(WEASYPRINT_SECRET, timestamp, body);
    }

    return new Response(JSON.stringify({
      url: pdfUrl,
      filename: sanitizedFilename,
      timestamp,
      signature,
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    console.error("html-to-pdf error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message, fallback: true }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
