import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { parseHTML } from "npm:linkedom@0.16.11";
import htmlToPdfmake from "npm:html-to-pdfmake@2.5.15";
import pdfMake from "npm:pdfmake@0.2.15/build/pdfmake.js";
import pdfFonts from "npm:pdfmake@0.2.15/build/vfs_fonts.js";

// Register fonts
(pdfMake as any).vfs = (pdfFonts as any).vfs || (pdfFonts as any).pdfMake?.vfs;

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
    const { html, filename } = await req.json();
    if (!html || typeof html !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'html' field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { window } = parseHTML(html);

    const pdfContent = htmlToPdfmake(window.document.body.innerHTML, {
      window: window,
    });

    const docDefinition = {
      content: pdfContent,
      pageSize: "A4",
      pageMargins: [36, 36, 36, 36],
      defaultStyle: {
        fontSize: 11,
        lineHeight: 1.4,
      },
      styles: {
        "html-h1": { fontSize: 22, bold: true, marginBottom: 8 },
        "html-h2": { fontSize: 18, bold: true, marginBottom: 6 },
        "html-h3": { fontSize: 15, bold: true, marginBottom: 4 },
        "html-h4": { fontSize: 13, bold: true, marginBottom: 4 },
        "html-p": { marginBottom: 6 },
        "html-strong": { bold: true },
        "html-em": { italics: true },
        "html-a": { color: "#1a73e8", decoration: "underline" },
      },
    };

    // Generate PDF bytes using pdfmake's getBuffer
    const pdfBytes = await new Promise<Uint8Array>((resolve, reject) => {
      try {
        const pdfDocGenerator = (pdfMake as any).createPdf(docDefinition);
        pdfDocGenerator.getBuffer((buffer: ArrayBuffer) => {
          resolve(new Uint8Array(buffer));
        });
      } catch (err) {
        reject(err);
      }
    });

    // Convert to base64 in chunks to avoid stack overflow
    let base64 = "";
    const CHUNK_SIZE = 8192;
    for (let i = 0; i < pdfBytes.length; i += CHUNK_SIZE) {
      base64 += String.fromCharCode(...pdfBytes.subarray(i, i + CHUNK_SIZE));
    }
    base64 = btoa(base64);

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
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
