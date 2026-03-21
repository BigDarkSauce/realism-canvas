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

    const blockContent = (blocks || []).map((b: any) => `[${b.id}] "${b.label}"${b.markdown ? ` Content: ${b.markdown}` : ''}${b.fileStorageUrl ? ` [Has file: ${b.fileName || 'attached'}]` : ''}`).join('\n');
    const connContent = (connections || []).map((c: any) => `${c.fromId} -> ${c.toId}`).join('\n');

    const systemPrompt = `You are a deep causal reasoning analyst implementing a knowledge graph system rooted in derivation-first epistemology. Your analysis must be thorough, elaborate, and intellectually rigorous.

ANALYSIS PHILOSOPHY:
- Not all knowledge should be memorized. The real discovery happens when we RECONSIDER things.
- If something is memorized at heart, it is very hard to relearn and accept other conclusions.
- Knowledge that can be DERIVED from local rules is the knowledge that matters.
- When generalizing, you don't need the full map of knowledge — you need rules, assumptions for reasoning, and the main generalizable points (those derivable with least computational effort from local rules).
- The full map of acquired rules across domains persists but gets walked from a specific domain each time, with blocks updated and rediscovered.

CONCEPT EXTRACTION — Be deeply elaborate:
For each concept found, provide:
1. A rich, multi-sentence description explaining what the concept is, why it matters, and how it connects to the broader intellectual landscape
2. The domain it belongs to
3. Source block IDs it was derived from
4. Its epistemic status: established, hypothetical, contested, or emergent

CAUSAL LINKS — Deeply explain each relationship:
For each causal link, provide:
1. A detailed multi-sentence explanation of WHY this causal relationship exists
2. The mechanism of causation — not just "A causes B" but HOW and through what intermediate reasoning
3. Whether the causation is bidirectional (can be derived forward AND in retrospect)
4. The type: causes, derives, contradicts, supports, evolves, enables, constrains, transforms
5. Confidence level and reasoning for that confidence

LOCAL DERIVATION RULES:
- Extract the minimal set of reasoning rules that connect concepts
- Each rule should be a principle, pattern, or heuristic that enables RE-DERIVATION when conditions change
- Rules are what get weighted during analysis — they connect to their neighbors based on relevance
- When a new rule needs consideration, give it high initial priority but note if connections are weak
- Identify the "generalizable points" — those derivable with least computation from local rules

MUTATIONS (if previous graph provided):
- Track how concepts CHANGED — emphasize shifting hypotheses and theories
- What was believed before vs now
- WHY the shift happened — what new evidence or reasoning caused it
- Whether the mutation represents convergence or divergence of understanding

BIDIRECTIONAL DERIVATION:
- Important: derivation should not just go chronologically forward
- It may start both forward and in retrospect, tightening the unexplored zone
- Identify where forward and retrospective reasoning CONVERGE

SUMMARY:
Write a comprehensive 3-5 paragraph analysis that:
1. Identifies the core intellectual threads across all canvas content
2. Maps how ideas evolved and branched
3. Highlights the most important causal chains and their implications
4. Notes areas of convergence and unresolved tensions
5. Suggests what the "propagating set of time-influenced interaction rules" reveals about the development trajectory`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Canvas blocks:\n${blockContent}\n\nConnections:\n${connContent}\n\n${previousGraph ? `Previous knowledge graph state:\n${JSON.stringify(previousGraph, null, 2)}\n\nAnalyze how concepts have MUTATED since the last analysis. Track shifting hypotheses.` : 'This is the first analysis. Extract all concepts, rules, and causal relationships with deep elaboration.'}` }
        ],
        tools: [{
          type: "function",
          function: {
            name: "build_knowledge_graph",
            description: "Build a deeply elaborated causal knowledge graph with rich descriptions",
            parameters: {
              type: "object",
              properties: {
                concepts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      label: { type: "string", description: "Short name of the concept" },
                      description: { type: "string", description: "Rich multi-sentence explanation of what this concept is, why it matters, how it connects to the broader landscape" },
                      sourceBlockIds: { type: "array", items: { type: "string" } },
                      domain: { type: "string" },
                      epistemicStatus: { type: "string", enum: ["established", "hypothetical", "contested", "emergent"] },
                    },
                    required: ["id", "label", "description", "sourceBlockIds", "domain", "epistemicStatus"],
                    additionalProperties: false
                  }
                },
                rules: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      description: { type: "string", description: "The derivation rule — a principle or pattern that enables re-derivation" },
                      elaboration: { type: "string", description: "Detailed explanation of why this rule exists and how it connects concepts" },
                      domain: { type: "string" },
                      sourceConceptIds: { type: "array", items: { type: "string" } },
                      isGeneralizable: { type: "boolean", description: "Whether this is a generalizable point derivable with least computation" },
                    },
                    required: ["id", "description", "elaboration", "domain", "sourceConceptIds", "isGeneralizable"],
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
                      type: { type: "string", enum: ["causes", "derives", "contradicts", "supports", "evolves", "enables", "constrains", "transforms"] },
                      description: { type: "string", description: "Detailed multi-sentence explanation of WHY this causal relationship exists and the mechanism" },
                      isBidirectional: { type: "boolean", description: "Whether causation can be derived both forward and in retrospect" },
                      confidence: { type: "string", enum: ["high", "medium", "low", "speculative"] },
                    },
                    required: ["id", "fromId", "toId", "type", "description", "isBidirectional", "confidence"],
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
                      previousState: { type: "string", description: "What was believed/understood before" },
                      newState: { type: "string", description: "What is now understood" },
                      reason: { type: "string", description: "Detailed explanation of what caused this shift" },
                      mutationType: { type: "string", enum: ["refined", "reversed", "expanded", "narrowed", "merged", "split"] },
                    },
                    required: ["id", "conceptId", "previousState", "newState", "reason", "mutationType"],
                    additionalProperties: false
                  }
                },
                convergencePoints: {
                  type: "array",
                  description: "Points where forward and retrospective reasoning converge",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      conceptIds: { type: "array", items: { type: "string" } },
                      description: { type: "string", description: "How and why these ideas converge from different directions" },
                    },
                    required: ["id", "conceptIds", "description"],
                    additionalProperties: false
                  }
                },
                summary: { type: "string", description: "Comprehensive 3-5 paragraph analysis of the intellectual landscape" }
              },
              required: ["concepts", "rules", "causalLinks", "mutations", "convergencePoints", "summary"],
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
