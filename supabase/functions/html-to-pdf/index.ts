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
      return new Response(
        JSON.stringify({ error: "BROWSERLESS_API_KEY not configured", fallback: true }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { html, filename } = await req.json();
    if (!html || typeof html !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'html' field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const sanitizedFilename = (filename || "export.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");

    // Call Browserless /pdf endpoint — headless Chrome renders the HTML
    const browserlessUrl = `https://production-sfo.browserless.io/pdf?token=${BROWSERLESS_API_KEY}`;

    const pdfResponse = await fetch(browserlessUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify({
        html,
        options: {
          displayHeaderFooter: false,
          printBackground: true,
          format: "A4",
          margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" },
        },
      }),
    });

    if (!pdfResponse.ok) {
      const errText = await pdfResponse.text().catch(() => "Unknown error");
      console.error("Browserless PDF error:", pdfResponse.status, errText);
      return new Response(
        JSON.stringify({ error: `PDF service error: ${pdfResponse.status}`, fallback: true }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Stream the PDF response body directly — no buffering in memory
    return new Response(pdfResponse.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${sanitizedFilename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    console.error("html-to-pdf error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message, fallback: true }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
