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
    const PDFCROWD_USERNAME = Deno.env.get("PDFCROWD_USERNAME");
    const PDFCROWD_API_KEY = Deno.env.get("PDFCROWD_API_KEY");

    if (!PDFCROWD_USERNAME || !PDFCROWD_API_KEY) {
      return new Response(
        JSON.stringify({ error: "PDFCrowd credentials not configured", fallback: true }),
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

    // Build multipart form for PDFCrowd API
    const formData = new FormData();
    formData.append("text", html);
    formData.append("content_viewport_width", "balanced");
    formData.append("no_margins", "false");
    formData.append("margin_top", "0.5in");
    formData.append("margin_right", "0.5in");
    formData.append("margin_bottom", "0.5in");
    formData.append("margin_left", "0.5in");
    formData.append("page_size", "A4");
    formData.append("output_name", sanitizedFilename);

    const credentials = btoa(`${PDFCROWD_USERNAME}:${PDFCROWD_API_KEY}`);

    const pdfResponse = await fetch("https://api.pdfcrowd.com/convert/24.04/", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
      },
      body: formData,
    });

    if (!pdfResponse.ok) {
      const errText = await pdfResponse.text().catch(() => "Unknown error");
      console.error("PDFCrowd error:", pdfResponse.status, errText);
      return new Response(
        JSON.stringify({ error: `PDF service error: ${pdfResponse.status}`, details: errText, fallback: true }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Stream PDF response directly — no buffering
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
