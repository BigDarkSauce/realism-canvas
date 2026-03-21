import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { KnowledgeGraphData, KnowledgeConcept, CausalLink, KnowledgeRule, KnowledgeMutation, Block, Connection } from '@/types/canvas';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Brain, RefreshCw, ChevronRight, Clock, Zap, AlertTriangle, ArrowRight, GitBranch } from 'lucide-react';
import { toast } from 'sonner';

interface KnowledgeGraphProps {
  open: boolean;
  onClose: () => void;
  blocks: Block[];
  connections: Connection[];
  knowledgeGraph: KnowledgeGraphData | null;
  onUpdateGraph: (graph: KnowledgeGraphData) => void;
}

const LINK_COLORS: Record<string, string> = {
  causes: '#f59e0b',
  derives: '#3b82f6',
  contradicts: '#ef4444',
  supports: '#22c55e',
  evolves: '#a855f7',
};

function forceLayout(concepts: KnowledgeConcept[], links: CausalLink[], width: number, height: number): KnowledgeConcept[] {
  const nodes = concepts.map((c, i) => ({
    ...c,
    x: c.x ?? width / 2 + Math.cos(i * 2 * Math.PI / concepts.length) * Math.min(width, height) * 0.35,
    y: c.y ?? height / 2 + Math.sin(i * 2 * Math.PI / concepts.length) * Math.min(width, height) * 0.35,
    vx: 0, vy: 0,
  }));

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  for (let iter = 0; iter < 80; iter++) {
    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x! - nodes[i].x!;
        const dy = nodes[j].y! - nodes[i].y!;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = 8000 / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].vx -= fx; nodes[i].vy -= fy;
        nodes[j].vx += fx; nodes[j].vy += fy;
      }
    }
    // Attraction via links
    for (const link of links) {
      const a = nodeMap.get(link.fromId);
      const b = nodeMap.get(link.toId);
      if (!a || !b) continue;
      const dx = b.x! - a.x!;
      const dy = b.y! - a.y!;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = (dist - 120) * 0.05 * link.weight;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }
    // Center gravity
    for (const n of nodes) {
      n.vx += (width / 2 - n.x!) * 0.005;
      n.vy += (height / 2 - n.y!) * 0.005;
      n.x! += n.vx * 0.3;
      n.y! += n.vy * 0.3;
      n.vx *= 0.85;
      n.vy *= 0.85;
      n.x = Math.max(40, Math.min(width - 40, n.x!));
      n.y = Math.max(40, Math.min(height - 40, n.y!));
    }
  }

  return nodes.map(({ vx, vy, ...rest }) => rest);
}

export default function KnowledgeGraph({ open, onClose, blocks, connections, knowledgeGraph, onUpdateGraph }: KnowledgeGraphProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<string | null>(null);
  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  const [tab, setTab] = useState<'graph' | 'rules' | 'mutations' | 'summary'>('graph');
  const svgRef = useRef<SVGSVGElement>(null);

  const layoutConcepts = useMemo(() => {
    if (!knowledgeGraph?.concepts.length) return [];
    return forceLayout(knowledgeGraph.concepts, knowledgeGraph.causalLinks, 700, 500);
  }, [knowledgeGraph?.concepts, knowledgeGraph?.causalLinks]);

  const analyze = useCallback(async () => {
    if (blocks.length === 0) { toast.error('No blocks to analyze'); return; }
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-canvas', {
        body: { blocks, connections, previousGraph: knowledgeGraph },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      onUpdateGraph({ ...data, lastAnalyzedAt: new Date().toISOString() });
      toast.success('Knowledge graph updated');
    } catch (err: any) {
      toast.error(err.message || 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }, [blocks, connections, knowledgeGraph, onUpdateGraph]);

  const highlightedLinks = useMemo(() => {
    if (!selectedConcept || !knowledgeGraph) return new Set<string>();
    return new Set(knowledgeGraph.causalLinks
      .filter(l => l.fromId === selectedConcept || l.toId === selectedConcept)
      .map(l => l.id));
  }, [selectedConcept, knowledgeGraph]);

  if (!open) return null;

  const graph = knowledgeGraph;
  const conceptMap = new Map(layoutConcepts.map(c => [c.id, c]));

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Brain className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Causal Knowledge Graph</h2>
          {graph?.lastAnalyzedAt && (
            <span className="text-xs text-muted-foreground">Last: {new Date(graph.lastAnalyzedAt).toLocaleString()}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={analyze} disabled={analyzing} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${analyzing ? 'animate-spin' : ''}`} />
            {analyzing ? 'Analyzing...' : 'Analyze Canvas'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 py-2 border-b border-border">
        {(['graph', 'rules', 'mutations', 'summary'] as const).map(t => (
          <Button key={t} variant={tab === t ? 'default' : 'ghost'} size="sm" onClick={() => setTab(t)} className="capitalize text-xs">{t}</Button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {!graph || !graph.concepts.length ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-4">
            <Brain className="h-16 w-16 text-muted-foreground/30" />
            <p className="text-muted-foreground">No knowledge graph yet. Click "Analyze Canvas" to extract concepts and causal relationships.</p>
            <Button onClick={analyze} disabled={analyzing} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${analyzing ? 'animate-spin' : ''}`} />
              Analyze Canvas
            </Button>
          </div>
        ) : tab === 'graph' ? (
          <>
            {/* Graph SVG */}
            <div className="flex-1 relative">
              <svg ref={svgRef} className="w-full h-full" viewBox="0 0 700 500">
                <defs>
                  {Object.entries(LINK_COLORS).map(([type, color]) => (
                    <marker key={type} id={`kg-arrow-${type}`} viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto">
                      <path d="M0,0 L10,3 L0,6 Z" fill={color} />
                    </marker>
                  ))}
                </defs>
                {/* Links */}
                {graph.causalLinks.map(link => {
                  const from = conceptMap.get(link.fromId);
                  const to = conceptMap.get(link.toId);
                  if (!from || !to) return null;
                  const opacity = selectedConcept ? (highlightedLinks.has(link.id) ? 1 : 0.1) : 0.7;
                  return (
                    <g key={link.id}>
                      <line
                        x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                        stroke={LINK_COLORS[link.type] || '#888'}
                        strokeWidth={Math.max(1, link.weight * 3)}
                        opacity={opacity}
                        markerEnd={`url(#kg-arrow-${link.type})`}
                      />
                      <title>{link.description} ({link.type}, weight: {link.weight.toFixed(2)})</title>
                    </g>
                  );
                })}
                {/* Concept nodes */}
                {layoutConcepts.map(concept => {
                  const r = 12 + concept.weight * 20;
                  const isSelected = selectedConcept === concept.id;
                  const dimmed = selectedConcept && !isSelected && !highlightedLinks.size;
                  return (
                    <g key={concept.id} onClick={() => setSelectedConcept(isSelected ? null : concept.id)} className="cursor-pointer">
                      <circle
                        cx={concept.x} cy={concept.y} r={r}
                        fill={isSelected ? 'hsl(var(--primary))' : 'hsl(var(--card))'}
                        stroke={isSelected ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                        strokeWidth={isSelected ? 3 : 1.5}
                        opacity={dimmed ? 0.3 : 1}
                      />
                      <text
                        x={concept.x} y={concept.y! + r + 14}
                        textAnchor="middle" fontSize="10" fill="hsl(var(--foreground))"
                        opacity={dimmed ? 0.3 : 1}
                      >
                        {concept.label.length > 20 ? concept.label.slice(0, 18) + '…' : concept.label}
                      </text>
                      <text
                        x={concept.x} y={concept.y! + 4}
                        textAnchor="middle" fontSize="8" fill={isSelected ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))'}
                        fontWeight="600"
                      >
                        {concept.weight.toFixed(1)}
                      </text>
                    </g>
                  );
                })}
              </svg>
              {/* Legend */}
              <div className="absolute bottom-4 left-4 flex items-center gap-3 bg-card/80 backdrop-blur px-3 py-2 rounded-lg border border-border text-xs">
                {Object.entries(LINK_COLORS).map(([type, color]) => (
                  <span key={type} className="flex items-center gap-1">
                    <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: color }} />
                    {type}
                  </span>
                ))}
              </div>
            </div>
            {/* Detail panel */}
            <div className="w-72 border-l border-border p-4 overflow-auto">
              {selectedConcept ? (() => {
                const c = graph.concepts.find(x => x.id === selectedConcept);
                if (!c) return null;
                const inLinks = graph.causalLinks.filter(l => l.toId === c.id);
                const outLinks = graph.causalLinks.filter(l => l.fromId === c.id);
                const relatedRules = graph.rules.filter(r => r.sourceConceptIds.includes(c.id));
                const muts = graph.mutations.filter(m => m.conceptId === c.id);
                return (
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold text-sm text-foreground">{c.label}</h3>
                      <p className="text-xs text-muted-foreground mt-1">Domain: {c.domain} · Weight: {c.weight.toFixed(2)}</p>
                    </div>
                    {inLinks.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground mb-1">← Caused by</h4>
                        {inLinks.map(l => (
                          <button key={l.id} onClick={() => setSelectedConcept(l.fromId)} className="block w-full text-left text-xs py-1 px-2 rounded hover:bg-accent text-foreground">
                            {graph.concepts.find(x => x.id === l.fromId)?.label || l.fromId}
                            <span className="ml-1 text-muted-foreground">({l.type})</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {outLinks.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground mb-1">→ Leads to</h4>
                        {outLinks.map(l => (
                          <button key={l.id} onClick={() => setSelectedConcept(l.toId)} className="block w-full text-left text-xs py-1 px-2 rounded hover:bg-accent text-foreground">
                            {graph.concepts.find(x => x.id === l.toId)?.label || l.toId}
                            <span className="ml-1 text-muted-foreground">({l.type})</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {relatedRules.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground mb-1">⚡ Rules</h4>
                        {relatedRules.map(r => (
                          <div key={r.id} className="text-xs py-1 px-2 rounded bg-accent/50 mb-1">
                            <span className="text-foreground">{r.description}</span>
                            <span className="text-muted-foreground ml-1">(w:{r.weight.toFixed(2)})</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {muts.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground mb-1">🔄 Mutations</h4>
                        {muts.map(m => (
                          <div key={m.id} className="text-xs py-1 px-2 rounded bg-destructive/10 mb-1">
                            <div className="text-foreground">{m.previousState} → {m.newState}</div>
                            <div className="text-muted-foreground">{m.reason}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })() : (
                <div className="text-xs text-muted-foreground">Click a concept node to explore its causal connections, rules, and mutations.</div>
              )}
            </div>
          </>
        ) : tab === 'rules' ? (
          <ScrollArea className="flex-1 p-6">
            <div className="max-w-2xl mx-auto space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Zap className="h-4 w-4" /> Local Derivation Rules ({graph.rules.length})</h3>
              <p className="text-xs text-muted-foreground mb-4">Minimal rules for re-deriving conclusions. Weighted by centrality and connection strength.</p>
              {graph.rules.sort((a, b) => b.weight - a.weight).map(rule => (
                <div key={rule.id} className="p-3 border border-border rounded-lg bg-card">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-foreground flex-1">{rule.description}</p>
                    <span className="text-xs font-mono bg-accent px-2 py-0.5 rounded text-accent-foreground whitespace-nowrap">{rule.weight.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <span>Domain: {rule.domain}</span>
                    <span>·</span>
                    <span>Concepts: {rule.sourceConceptIds.length}</span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : tab === 'mutations' ? (
          <ScrollArea className="flex-1 p-6">
            <div className="max-w-2xl mx-auto space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><GitBranch className="h-4 w-4" /> Concept Mutations ({graph.mutations.length})</h3>
              <p className="text-xs text-muted-foreground mb-4">How hypotheses and theories evolved through analysis iterations.</p>
              {graph.mutations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No mutations tracked yet. Run analysis multiple times to see how concepts evolve.</p>
              ) : graph.mutations.map(mut => {
                const concept = graph.concepts.find(c => c.id === mut.conceptId);
                return (
                  <div key={mut.id} className="p-3 border border-border rounded-lg bg-card">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="h-3 w-3 text-destructive" />
                      <span className="text-xs font-medium text-foreground">{concept?.label || mut.conceptId}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="bg-destructive/10 text-destructive px-2 py-0.5 rounded">{mut.previousState}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="bg-primary/10 text-primary px-2 py-0.5 rounded">{mut.newState}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{mut.reason}</p>
                    {mut.timestamp && <p className="text-xs text-muted-foreground mt-1"><Clock className="h-3 w-3 inline mr-1" />{new Date(mut.timestamp).toLocaleString()}</p>}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        ) : (
          <ScrollArea className="flex-1 p-6">
            <div className="max-w-2xl mx-auto">
              <h3 className="text-sm font-semibold text-foreground mb-3">Analysis Summary</h3>
              <p className="text-sm text-foreground whitespace-pre-wrap">{graph.summary || 'No summary available.'}</p>
              <div className="mt-6 grid grid-cols-3 gap-4 text-center">
                <div className="p-3 bg-card rounded-lg border border-border">
                  <div className="text-2xl font-bold text-foreground">{graph.concepts.length}</div>
                  <div className="text-xs text-muted-foreground">Concepts</div>
                </div>
                <div className="p-3 bg-card rounded-lg border border-border">
                  <div className="text-2xl font-bold text-foreground">{graph.rules.length}</div>
                  <div className="text-xs text-muted-foreground">Rules</div>
                </div>
                <div className="p-3 bg-card rounded-lg border border-border">
                  <div className="text-2xl font-bold text-foreground">{graph.causalLinks.length}</div>
                  <div className="text-xs text-muted-foreground">Causal Links</div>
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
