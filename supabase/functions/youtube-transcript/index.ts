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
  // Use YouTube's internal API endpoint for captions
  // First, get the video page to extract a valid session
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  const pageRes = await fetch(watchUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });
  
  const html = await pageRes.text();
  
  // Try multiple patterns to find caption tracks
  const patterns = [
    /"captionTracks":\s*(\[.*?\])/s,
    /captionTracks":\s*(\[.*?\])/s,
  ];
  
  let captionTracksJson: string | null = null;
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      captionTracksJson = match[1];
      break;
    }
  }
  
  if (!captionTracksJson) {
    // Try finding any timedtext URL directly
    const timedTextMatch = html.match(/https:\/\/www\.youtube\.com\/api\/timedtext[^"\\]*/);
    if (timedTextMatch) {
      const captionUrl = timedTextMatch[0].replace(/\\u0026/g, "&");
      console.log("Found direct timedtext URL");
      return await fetchAndParseCaptionXml(captionUrl);
    }
    
    console.error("No caption data found in page HTML");
    console.log("Page length:", html.length);
    // Check if we got a consent page
    if (html.includes("consent.youtube.com") || html.includes("CONSENT")) {
      console.error("Got consent/cookie page instead of video page");
    }
    return null;
  }
  
  let tracks;
  try {
    // Clean up the JSON - it may have escaped characters
    const cleaned = captionTracksJson.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    tracks = JSON.parse(cleaned);
  } catch {
    // Try a more aggressive extraction
    try {
      tracks = JSON.parse(captionTracksJson);
    } catch (e2) {
      console.error("Failed to parse caption tracks JSON:", e2);
      return null;
    }
  }
  
  if (!tracks || tracks.length === 0) {
    console.error("No caption tracks available");
    return null;
  }
  
  // Prefer English, fall back to first
  const track = tracks.find((t: any) => t.languageCode === "en" || t.vssId?.startsWith(".en")) || tracks[0];
  console.log("Using caption track:", track.languageCode, track.name?.simpleText || track.name);
  
  return await fetchAndParseCaptionXml(track.baseUrl);
}

async function fetchAndParseCaptionXml(captionUrl: string): Promise<string | null> {
  const captionRes = await fetch(captionUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });
  const captionXml = await captionRes.text();
  
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
    console.error("No text segments in caption XML, length:", captionXml.length);
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

    // Fetch video title via oembed (works without auth)
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
          error: "No captions found. The video may not have subtitles enabled, or captions could not be retrieved.",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use Lovable AI to format with proper punctuation and paragraphing
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
              "You are a transcript formatter. Take the raw YouTube caption text and format it into a clean, readable transcript. Add proper punctuation, capitalization, and paragraph breaks. Group related sentences into logical paragraphs separated by double newlines. Do NOT add any commentary, headers, metadata, or markdown formatting — just output the plain formatted transcript text. Preserve the original words exactly; only fix punctuation, capitalization, and add paragraph spacing.",
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
      console.error("AI gateway error:", status);
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
