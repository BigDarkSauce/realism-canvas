import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const BROWSERLESS_API_KEY = Deno.env.get("BROWSERLESS_API_KEY");
    if (!BROWSERLESS_API_KEY) {
      // No API key configured — signal client to use fallback
      return new Response(
        JSON.stringify({ error: "BROWSERLESS_API_KEY is not configured", fallback: true }),
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

    // Call Browserless Chrome /pdf endpoint
    const browserlessUrl = `https://production-sfo.browserless.io/pdf?token=${BROWSERLESS_API_KEY}`;

    const response = await fetch(browserlessUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        html,
        options: {
          format: "A4",
          printBackground: true,
          margin: {
            top: "0.5in",
            right: "0.5in",
            bottom: "0.5in",
            left: "0.5in",
          },
          displayHeaderFooter: false,
          preferCSSPageSize: false,
        },
        gotoOptions: {
          waitUntil: "networkidle2",
          timeout: 30000,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Browserless API error [${response.status}]:`, errorText);
      return new Response(
        JSON.stringify({ error: `Browserless API failed: ${errorText}`, fallback: true }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const pdfBytes = new Uint8Array(await response.arrayBuffer());

    // Return PDF bytes as base64
    const CHUNK = 8192;
    let binary = "";
    for (let i = 0; i < pdfBytes.length; i += CHUNK) {
      binary += String.fromCharCode(...pdfBytes.subarray(i, i + CHUNK));
    }
    const base64 = btoa(binary);

    return new Response(
      JSON.stringify({ pdf: base64, filename: filename || "export.pdf" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("html-to-pdf error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message, fallback: true }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
