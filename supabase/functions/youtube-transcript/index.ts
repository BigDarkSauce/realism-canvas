import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("/")[0];
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
  } catch { /* ignore */ }
  return null;
}

async function fetchCaptions(videoId: string): Promise<string | null> {
  // Fetch the YouTube page to extract caption track URL
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  const html = await pageRes.text();

  // Extract captions JSON from ytInitialPlayerResponse
  const match = html.match(/"captions":\s*(\{.*?"captionTracks":\s*\[.*?\].*?\})/s);
  if (!match) return null;

  // Try to parse and find English captions
  try {
    const captionsJson = match[1];
    const trackMatch = captionsJson.match(/"baseUrl":\s*"(.*?)"/);
    if (!trackMatch) return null;

    let captionUrl = trackMatch[1].replace(/\\u0026/g, "&");
    // Ensure we get plain text format
    if (!captionUrl.includes("fmt=")) captionUrl += "&fmt=srv3";

    const captionRes = await fetch(captionUrl);
    const captionXml = await captionRes.text();

    // Parse XML captions and extract text
    const textSegments: string[] = [];
    const regex = /<text[^>]*>(.*?)<\/text>/gs;
    let m;
    while ((m = regex.exec(captionXml)) !== null) {
      let text = m[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n/g, " ")
        .trim();
      if (text) textSegments.push(text);
    }

    return textSegments.join(" ");
  } catch (e) {
    console.error("Caption parse error:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return new Response(JSON.stringify({ error: "Invalid YouTube URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch raw captions
    const rawText = await fetchCaptions(videoId);
    if (!rawText) {
      return new Response(
        JSON.stringify({ error: "No captions available for this video. The video may not have subtitles." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use Lovable AI to add punctuation and paragraphing
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      // Return raw text if no AI key
      return new Response(JSON.stringify({ transcript: rawText, videoId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are a transcript formatter. Take the raw caption text and format it into a clean, readable transcript with proper punctuation, capitalization, and paragraph breaks. Group related sentences into paragraphs. Do NOT add any commentary, headers, or metadata — just output the formatted transcript text. Preserve the original words exactly; only fix punctuation, capitalization, and add paragraph spacing.",
          },
          { role: "user", content: rawText },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Fallback to raw text
      console.error("AI error:", aiResponse.status);
      return new Response(JSON.stringify({ transcript: rawText, videoId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const formatted = aiData.choices?.[0]?.message?.content || rawText;

    // Also fetch video title
    let videoTitle = "YouTube Video";
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        videoTitle = oembedData.title || videoTitle;
      }
    } catch { /* ignore */ }

    return new Response(
      JSON.stringify({ transcript: formatted, videoId, videoTitle }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
