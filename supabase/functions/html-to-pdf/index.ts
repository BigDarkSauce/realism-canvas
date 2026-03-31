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

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (WEASYPRINT_SECRET) {
      headers["Authorization"] = `Bearer ${WEASYPRINT_SECRET}`;
    }

    const pdfUrl = `${WEASYPRINT_URL.replace(/\/$/, "")}/pdf`;
    const response = await fetch(pdfUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ html }),
    });

    if (!response.ok) {
      const errorText = (await response.text()).slice(0, 2000);
      console.error(`WeasyPrint API error [${response.status}]:`, errorText);
      return new Response(
        JSON.stringify({ error: `WeasyPrint API failed: ${errorText}`, fallback: true }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!response.body) {
      return new Response(
        JSON.stringify({ error: "PDF service returned an empty response", fallback: true }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const outgoingHeaders = new Headers(corsHeaders);
    outgoingHeaders.set("Content-Type", "application/pdf");
    outgoingHeaders.set(
      "Content-Disposition",
      `attachment; filename="${(filename || "export.pdf").replace(/"/g, "_")}"`
    );

    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      outgoingHeaders.set("Content-Length", contentLength);
    }

    return new Response(response.body, {
      status: 200,
      headers: outgoingHeaders,
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
