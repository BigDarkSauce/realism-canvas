import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("/")[0].split("?")[0];
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
  } catch { /* ignore */ }
  return null;
}

async function fetchCaptions(videoId: string): Promise<string | null> {
  // Fetch YouTube page HTML
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  const html = await pageRes.text();

  // Find captionTracks in the page
  const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
  if (!playerMatch) {
    console.error("No ytInitialPlayerResponse found");
    return null;
  }

  let playerResponse;
  try {
    playerResponse = JSON.parse(playerMatch[1]);
  } catch (e) {
    console.error("Failed to parse player response:", e);
    return null;
  }

  const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!captionTracks || captionTracks.length === 0) {
    console.error("No caption tracks found");
    return null;
  }

  // Prefer English, fall back to first available
  let track = captionTracks.find((t: any) => t.languageCode === "en") || captionTracks[0];
  let captionUrl = track.baseUrl;

  console.log("Found caption track:", track.languageCode, track.name?.simpleText);

  // Fetch the caption XML
  const captionRes = await fetch(captionUrl);
  const captionXml = await captionRes.text();

  // Parse XML and extract text
  const textSegments: string[] = [];
  const regex = /<text[^>]*>([\s\S]*?)<\/text>/g;
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

  if (textSegments.length === 0) {
    console.error("No text segments found in caption XML");
    return null;
  }

  console.log(`Extracted ${textSegments.length} text segments`);
  return textSegments.join(" ");
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

    // Fetch video title via oembed
    let videoTitle = "YouTube Video";
    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
      );
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        videoTitle = oembedData.title || videoTitle;
      }
    } catch { /* ignore */ }

    // Fetch raw captions
    const rawText = await fetchCaptions(videoId);
    if (!rawText) {
      return new Response(
        JSON.stringify({
          error: "No captions available for this video. The video may not have subtitles enabled.",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use Lovable AI to add punctuation and paragraphing
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ transcript: rawText, videoId, videoTitle }), {
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
              "You are a transcript formatter. Take the raw caption text and format it into a clean, readable transcript with proper punctuation, capitalization, and paragraph breaks. Group related sentences into logical paragraphs. Do NOT add any commentary, headers, metadata, or markdown formatting — just output the plain formatted transcript text. Preserve the original words exactly; only fix punctuation, capitalization, and add paragraph spacing (double newlines between paragraphs).",
          },
          { role: "user", content: rawText },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI gateway error:", status, await aiResponse.text());
      return new Response(JSON.stringify({ transcript: rawText, videoId, videoTitle }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const formatted = aiData.choices?.[0]?.message?.content || rawText;

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
