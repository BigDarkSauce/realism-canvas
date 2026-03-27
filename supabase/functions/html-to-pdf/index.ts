import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { parseHTML } from "npm:linkedom@0.16.11";
import htmlToPdfmake from "npm:html-to-pdfmake@2.5.15";
import PdfPrinter from "npm:pdfmake@0.2.15/src/printer.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const fonts = {
  Roboto: {
    normal: "node_modules/pdfmake/build/vfs_fonts.js",
    bold: "node_modules/pdfmake/build/vfs_fonts.js",
    italics: "node_modules/pdfmake/build/vfs_fonts.js",
    bolditalics: "node_modules/pdfmake/build/vfs_fonts.js",
  },
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

    // Parse HTML using linkedom — provides window, document, DOMParser
    const { window, document } = parseHTML(html);

    // html-to-pdfmake needs window with DOMParser
    const pdfContent = htmlToPdfmake(document.body.innerHTML, {
      window: window,
    });

    const docDefinition = {
      content: pdfContent,
      pageSize: "A4" as const,
      pageMargins: [36, 36, 36, 36] as [number, number, number, number],
      defaultStyle: {
        font: "Roboto",
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
        "html-a": { color: "#1a73e8", decoration: "underline" as const },
      },
    };

    const printer = new PdfPrinter(fonts);
    const pdfDoc = printer.createPdfKitDocument(docDefinition);

    const chunks: Uint8Array[] = [];
    await new Promise<void>((resolve, reject) => {
      pdfDoc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
      pdfDoc.on("end", () => resolve());
      pdfDoc.on("error", (err: Error) => reject(err));
      pdfDoc.end();
    });

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const pdfBytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      pdfBytes.set(chunk, offset);
      offset += chunk.length;
    }

    // Return as base64
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
