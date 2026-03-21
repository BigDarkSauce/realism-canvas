import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { blocks, connections, previousGraph } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const blockContent = (blocks || []).map((b: any) => `[${b.id}] "${b.label}"${b.markdown ? ` Content: ${b.markdown}` : ''}`).join('\n');
    const connContent = (connections || []).map((c: any) => `${c.fromId} -> ${c.toId}`).join('\n');

    const systemPrompt = `You are a knowledge graph analyst implementing a causal reasoning system. Analyze canvas blocks and their connections to extract:

1. CONCEPTS: Key ideas, hypotheses, and theories discussed across blocks. Assign weights (0-1) based on centrality.
2. RULES: Local derivation rules — patterns, principles, or heuristics connecting concepts. These should be the minimal set needed to re-derive conclusions. Weight by importance.
3. CAUSAL LINKS: Relationships between concepts/rules. Types: causes, derives, contradicts, supports, evolves.
4. MUTATIONS: If previous graph state is provided, track how concepts changed — emphasize shifting hypotheses and evolving theories.

Key principles:
- Not all knowledge should be memorized. Focus on DERIVABLE rules, not facts.
- Rules should enable re-derivation when conditions change.
- Consider bidirectional causation — things can be derived forward and in retrospect.
- Weight rules by how many neighbors they connect to and how central they are.
- When a new rule needs consideration, give it high initial priority but reduce weight if connections are weak.
- Identify the "generalisable points" — those derivable with least computation from local rules.
- Track the propagating set of time-influenced interaction rules.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Canvas blocks:\n${blockContent}\n\nConnections:\n${connContent}\n\n${previousGraph ? `Previous knowledge graph:\n${JSON.stringify(previousGraph, null, 2)}` : 'No previous analysis.'}` }
        ],
        tools: [{
          type: "function",
          function: {
            name: "build_knowledge_graph",
            description: "Build a causal knowledge graph with concepts, rules, links, and mutations",
            parameters: {
              type: "object",
              properties: {
                concepts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      label: { type: "string" },
                      sourceBlockIds: { type: "array", items: { type: "string" } },
                      weight: { type: "number" },
                      domain: { type: "string" },
                    },
                    required: ["id", "label", "sourceBlockIds", "weight", "domain"],
                    additionalProperties: false
                  }
                },
                rules: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      description: { type: "string" },
                      weight: { type: "number" },
                      domain: { type: "string" },
                      sourceConceptIds: { type: "array", items: { type: "string" } }
                    },
                    required: ["id", "description", "weight", "domain", "sourceConceptIds"],
                    additionalProperties: false
                  }
                },
                causalLinks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      fromId: { type: "string" },
                      toId: { type: "string" },
                      type: { type: "string", enum: ["causes", "derives", "contradicts", "supports", "evolves"] },
                      weight: { type: "number" },
                      description: { type: "string" }
                    },
                    required: ["id", "fromId", "toId", "type", "weight", "description"],
                    additionalProperties: false
                  }
                },
                mutations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      conceptId: { type: "string" },
                      previousState: { type: "string" },
                      newState: { type: "string" },
                      reason: { type: "string" }
                    },
                    required: ["id", "conceptId", "previousState", "newState", "reason"],
                    additionalProperties: false
                  }
                },
                summary: { type: "string" }
              },
              required: ["concepts", "rules", "causalLinks", "mutations", "summary"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "build_knowledge_graph" } }
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings > Workspace > Usage." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      throw new Error(`AI gateway error: ${status}`);
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No structured output from AI");

    const graphData = JSON.parse(toolCall.function.arguments);
    graphData.lastAnalyzedAt = new Date().toISOString();

    return new Response(JSON.stringify(graphData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-canvas error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
