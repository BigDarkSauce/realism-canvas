import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { KnowledgeGraphData, KnowledgeConcept, CausalLink, KnowledgeRule, Block, Connection, ConvergencePoint } from '@/types/canvas';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Brain, RefreshCw, Zap, ArrowRight, Target, Lightbulb, ArrowLeftRight, ShieldCheck, HelpCircle, AlertCircle, Sparkles } from 'lucide-react';
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
  enables: '#06b6d4',
  constrains: '#f97316',
  transforms: '#ec4899',
};

const CONFIDENCE_OPACITY: Record<string, number> = {
  high: 1,
  medium: 0.75,
  low: 0.5,
  speculative: 0.35,
};

const STATUS_ICONS: Record<string, typeof ShieldCheck> = {
  established: ShieldCheck,
  hypothetical: HelpCircle,
  contested: AlertCircle,
  emergent: Sparkles,
};

const STATUS_COLORS: Record<string, string> = {
  established: 'text-green-500',
  hypothetical: 'text-blue-400',
  contested: 'text-red-400',
  emergent: 'text-purple-400',
};

function forceLayout(concepts: KnowledgeConcept[], links: CausalLink[], width: number, height: number): KnowledgeConcept[] {
  const nodes = concepts.map((c, i) => ({
    ...c,
    x: c.x ?? width / 2 + Math.cos(i * 2 * Math.PI / concepts.length) * Math.min(width, height) * 0.35,
    y: c.y ?? height / 2 + Math.sin(i * 2 * Math.PI / concepts.length) * Math.min(width, height) * 0.35,
    vx: 0, vy: 0,
  }));

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  // Count connections per node for sizing
  const connectionCount = new Map<string, number>();
  for (const link of links) {
    connectionCount.set(link.fromId, (connectionCount.get(link.fromId) || 0) + 1);
    connectionCount.set(link.toId, (connectionCount.get(link.toId) || 0) + 1);
  }

  for (let iter = 0; iter < 100; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x! - nodes[i].x!;
        const dy = nodes[j].y! - nodes[i].y!;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = 10000 / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].vx -= fx; nodes[i].vy -= fy;
        nodes[j].vx += fx; nodes[j].vy += fy;
      }
    }
    for (const link of links) {
      const a = nodeMap.get(link.fromId);
      const b = nodeMap.get(link.toId);
      if (!a || !b) continue;
      const dx = b.x! - a.x!;
      const dy = b.y! - a.y!;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = (dist - 150) * 0.04;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }
    for (const n of nodes) {
      n.vx += (width / 2 - n.x!) * 0.004;
      n.vy += (height / 2 - n.y!) * 0.004;
      n.x! += n.vx * 0.25;
      n.y! += n.vy * 0.25;
      n.vx *= 0.82;
      n.vy *= 0.82;
      n.x = Math.max(60, Math.min(width - 60, n.x!));
      n.y = Math.max(60, Math.min(height - 60, n.y!));
    }
  }

  return nodes.map(({ vx, vy, ...rest }) => rest);
}

export default function KnowledgeGraph({ open, onClose, blocks, connections, knowledgeGraph, onUpdateGraph }: KnowledgeGraphProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<string | null>(null);
  const [tab, setTab] = useState<'graph' | 'rules' | 'convergence' | 'summary'>('graph');
  const svgRef = useRef<SVGSVGElement>(null);

  const layoutConcepts = useMemo(() => {
    if (!knowledgeGraph?.concepts.length) return [];
    return forceLayout(knowledgeGraph.concepts, knowledgeGraph.causalLinks, 700, 500);
  }, [knowledgeGraph?.concepts, knowledgeGraph?.causalLinks]);

  // Connection count for sizing nodes
  const connectionCount = useMemo(() => {
    const counts = new Map<string, number>();
    if (!knowledgeGraph) return counts;
    for (const link of knowledgeGraph.causalLinks) {
      counts.set(link.fromId, (counts.get(link.fromId) || 0) + 1);
      counts.set(link.toId, (counts.get(link.toId) || 0) + 1);
    }
    return counts;
  }, [knowledgeGraph]);

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
        {(['graph', 'rules', 'convergence', 'summary'] as const).map(t => (
          <Button key={t} variant={tab === t ? 'default' : 'ghost'} size="sm" onClick={() => setTab(t)} className="capitalize text-xs">
            {t === 'convergence' ? 'Convergence Points' : t}
          </Button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {!graph || !graph.concepts.length ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-4">
            <Brain className="h-16 w-16 text-muted-foreground/30" />
            <p className="text-muted-foreground max-w-md text-center">No knowledge graph yet. Click "Analyze Canvas" to deeply extract concepts, causal relationships, derivation rules, and convergence points from your canvas content.</p>
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
                  const isHighlighted = selectedConcept ? highlightedLinks.has(link.id) : true;
                  const opacity = isHighlighted ? (CONFIDENCE_OPACITY[link.confidence || 'medium'] || 0.7) : 0.08;
                  return (
                    <g key={link.id}>
                      <line
                        x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                        stroke={LINK_COLORS[link.type] || '#888'}
                        strokeWidth={2}
                        strokeDasharray={link.confidence === 'speculative' ? '4 3' : link.confidence === 'low' ? '6 3' : undefined}
                        opacity={opacity}
                        markerEnd={`url(#kg-arrow-${link.type})`}
                      />
                      {link.isBidirectional && (
                        <line
                          x1={to.x} y1={to.y} x2={from.x} y2={from.y}
                          stroke={LINK_COLORS[link.type] || '#888'}
                          strokeWidth={1}
                          strokeDasharray="3 4"
                          opacity={opacity * 0.5}
                          markerEnd={`url(#kg-arrow-${link.type})`}
                        />
                      )}
                      <title>{link.description} ({link.type}, {link.confidence || 'medium'} confidence{link.isBidirectional ? ', bidirectional' : ''})</title>
                    </g>
                  );
                })}
                {/* Concept nodes */}
                {layoutConcepts.map(concept => {
                  const connections = connectionCount.get(concept.id) || 0;
                  const r = 14 + Math.min(connections * 4, 20);
                  const isSelected = selectedConcept === concept.id;
                  const dimmed = selectedConcept && !isSelected && !highlightedLinks.size;
                  const StatusIcon = STATUS_ICONS[concept.epistemicStatus || 'established'] || ShieldCheck;
                  return (
                    <g key={concept.id} onClick={() => setSelectedConcept(isSelected ? null : concept.id)} className="cursor-pointer">
                      <circle
                        cx={concept.x} cy={concept.y} r={r}
                        fill={isSelected ? 'hsl(var(--primary))' : 'hsl(var(--card))'}
                        stroke={isSelected ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                        strokeWidth={isSelected ? 3 : 1.5}
                        opacity={dimmed ? 0.2 : 1}
                      />
                      <text
                        x={concept.x} y={concept.y! + r + 14}
                        textAnchor="middle" fontSize="9" fill="hsl(var(--foreground))"
                        opacity={dimmed ? 0.2 : 1}
                      >
                        {concept.label.length > 24 ? concept.label.slice(0, 22) + '…' : concept.label}
                      </text>
                      <text
                        x={concept.x} y={concept.y! + 4}
                        textAnchor="middle" fontSize="7" fill={isSelected ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))'}
                        fontWeight="600"
                      >
                        {(concept.epistemicStatus || 'est.').slice(0, 4)}
                      </text>
                    </g>
                  );
                })}
              </svg>
              {/* Legend */}
              <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-2 bg-card/90 backdrop-blur px-3 py-2 rounded-lg border border-border text-xs max-w-sm">
                {Object.entries(LINK_COLORS).map(([type, color]) => (
                  <span key={type} className="flex items-center gap-1">
                    <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: color }} />
                    <span className="text-muted-foreground">{type}</span>
                  </span>
                ))}
                <span className="w-full border-t border-border pt-1 mt-1 flex items-center gap-2 text-muted-foreground">
                  <span>Dashed = low confidence</span>
                  <span>·</span>
                  <span>↔ = bidirectional</span>
                </span>
              </div>
            </div>
            {/* Detail panel */}
            <ScrollArea className="w-80 border-l border-border">
              <div className="p-4">
                {selectedConcept ? (() => {
                  const c = graph.concepts.find(x => x.id === selectedConcept);
                  if (!c) return null;
                  const inLinks = graph.causalLinks.filter(l => l.toId === c.id);
                  const outLinks = graph.causalLinks.filter(l => l.fromId === c.id);
                  const relatedRules = graph.rules.filter(r => r.sourceConceptIds.includes(c.id));
                  const muts = graph.mutations.filter(m => m.conceptId === c.id);
                  const StatusIcon = STATUS_ICONS[c.epistemicStatus || 'established'] || ShieldCheck;
                  const statusColor = STATUS_COLORS[c.epistemicStatus || 'established'] || '';
                  return (
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <StatusIcon className={`h-4 w-4 ${statusColor}`} />
                          <h3 className="font-semibold text-sm text-foreground">{c.label}</h3>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                          <span className="bg-accent px-1.5 py-0.5 rounded">{c.domain}</span>
                          <span className="capitalize">{c.epistemicStatus || 'established'}</span>
                        </div>
                        {c.description && (
                          <p className="text-xs text-foreground/80 leading-relaxed">{c.description}</p>
                        )}
                      </div>

                      {inLinks.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                            <ArrowRight className="h-3 w-3 rotate-180" /> Caused by ({inLinks.length})
                          </h4>
                          {inLinks.map(l => (
                            <div key={l.id} className="mb-2">
                              <button onClick={() => setSelectedConcept(l.fromId)} className="block w-full text-left text-xs py-1 px-2 rounded hover:bg-accent text-foreground font-medium">
                                {graph.concepts.find(x => x.id === l.fromId)?.label || l.fromId}
                                <span className="ml-1 text-muted-foreground">({l.type})</span>
                                {l.isBidirectional && <ArrowLeftRight className="h-3 w-3 inline ml-1 text-primary" />}
                              </button>
                              <p className="text-xs text-muted-foreground px-2 leading-relaxed">{l.description}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {outLinks.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                            <ArrowRight className="h-3 w-3" /> Leads to ({outLinks.length})
                          </h4>
                          {outLinks.map(l => (
                            <div key={l.id} className="mb-2">
                              <button onClick={() => setSelectedConcept(l.toId)} className="block w-full text-left text-xs py-1 px-2 rounded hover:bg-accent text-foreground font-medium">
                                {graph.concepts.find(x => x.id === l.toId)?.label || l.toId}
                                <span className="ml-1 text-muted-foreground">({l.type}, {l.confidence})</span>
                              </button>
                              <p className="text-xs text-muted-foreground px-2 leading-relaxed">{l.description}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {relatedRules.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                            <Zap className="h-3 w-3" /> Derivation Rules ({relatedRules.length})
                          </h4>
                          {relatedRules.map(r => (
                            <div key={r.id} className="text-xs py-2 px-2 rounded bg-accent/50 mb-2">
                              <div className="flex items-start gap-1">
                                {r.isGeneralizable && <Lightbulb className="h-3 w-3 text-yellow-500 shrink-0 mt-0.5" />}
                                <span className="text-foreground font-medium">{r.description}</span>
                              </div>
                              {r.elaboration && <p className="text-muted-foreground mt-1 leading-relaxed">{r.elaboration}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                      {muts.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                            <GitBranch className="h-3 w-3" /> Mutations ({muts.length})
                          </h4>
                          {muts.map(m => (
                            <div key={m.id} className="text-xs py-2 px-2 rounded bg-destructive/10 mb-2">
                              <div className="flex items-center gap-1 mb-1">
                                <span className="capitalize bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{m.mutationType || 'refined'}</span>
                              </div>
                              <div className="flex items-start gap-2 my-1">
                                <span className="bg-destructive/20 text-destructive px-2 py-0.5 rounded flex-1">{m.previousState}</span>
                                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
                                <span className="bg-primary/20 text-primary px-2 py-0.5 rounded flex-1">{m.newState}</span>
                              </div>
                              <p className="text-muted-foreground mt-1 leading-relaxed">{m.reason}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">Click a concept node to explore its causal connections, derivation rules, and mutations.</p>
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-foreground">All Concepts ({graph.concepts.length})</h4>
                      {graph.concepts.map(c => {
                        const StatusIcon = STATUS_ICONS[c.epistemicStatus || 'established'] || ShieldCheck;
                        const statusColor = STATUS_COLORS[c.epistemicStatus || 'established'] || '';
                        return (
                          <button key={c.id} onClick={() => setSelectedConcept(c.id)}
                            className="block w-full text-left text-xs py-1.5 px-2 rounded hover:bg-accent text-foreground">
                            <div className="flex items-center gap-1.5">
                              <StatusIcon className={`h-3 w-3 ${statusColor}`} />
                              <span className="font-medium">{c.label}</span>
                              <span className="text-muted-foreground ml-auto">{c.domain}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        ) : tab === 'rules' ? (
          <ScrollArea className="flex-1 p-6">
            <div className="max-w-3xl mx-auto space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Zap className="h-4 w-4" /> Local Derivation Rules ({graph.rules.length})</h3>
                <p className="text-xs text-muted-foreground mt-1">Minimal rules for re-deriving conclusions. These are the reasoning principles that connect concepts — not facts to memorize, but patterns to reason with.</p>
              </div>
              {graph.rules.map(rule => (
                <div key={rule.id} className="p-4 border border-border rounded-lg bg-card">
                  <div className="flex items-start gap-2">
                    {rule.isGeneralizable && (
                      <div className="shrink-0 mt-0.5" title="Generalizable — derivable with least computation">
                        <Lightbulb className="h-4 w-4 text-yellow-500" />
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{rule.description}</p>
                      {rule.elaboration && (
                        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{rule.elaboration}</p>
                      )}
                      <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                        <span className="bg-accent px-1.5 py-0.5 rounded">{rule.domain}</span>
                        <span>Connects {rule.sourceConceptIds.length} concept{rule.sourceConceptIds.length !== 1 ? 's' : ''}</span>
                        {rule.isGeneralizable && <span className="text-yellow-600 font-medium">★ Generalizable</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : tab === 'mutations' ? (
          <ScrollArea className="flex-1 p-6">
            <div className="max-w-3xl mx-auto space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><GitBranch className="h-4 w-4" /> Concept Mutations ({graph.mutations.length})</h3>
                <p className="text-xs text-muted-foreground mt-1">How hypotheses and theories evolved. Real discovery happens when we reconsider things — tracking these shifts reveals the development trajectory.</p>
              </div>
              {graph.mutations.length === 0 ? (
                <div className="text-center py-8">
                  <AlertTriangle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No mutations tracked yet. Run analysis multiple times to see how concepts evolve and hypotheses shift.</p>
                </div>
              ) : graph.mutations.map(mut => {
                const concept = graph.concepts.find(c => c.id === mut.conceptId);
                return (
                  <div key={mut.id} className="p-4 border border-border rounded-lg bg-card">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <span className="text-sm font-medium text-foreground">{concept?.label || mut.conceptId}</span>
                      <span className="capitalize text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground ml-auto">{mut.mutationType || 'refined'}</span>
                    </div>
                    <div className="flex items-start gap-3 mb-3">
                      <div className="flex-1 p-2 bg-destructive/10 rounded text-xs text-destructive">
                        <div className="font-medium mb-0.5">Previous Understanding</div>
                        {mut.previousState}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-4" />
                      <div className="flex-1 p-2 bg-primary/10 rounded text-xs text-primary">
                        <div className="font-medium mb-0.5">Current Understanding</div>
                        {mut.newState}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed"><span className="font-medium">Why this shifted:</span> {mut.reason}</p>
                    {mut.timestamp && <p className="text-xs text-muted-foreground mt-1"><Clock className="h-3 w-3 inline mr-1" />{new Date(mut.timestamp).toLocaleString()}</p>}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        ) : tab === 'convergence' ? (
          <ScrollArea className="flex-1 p-6">
            <div className="max-w-3xl mx-auto space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Target className="h-4 w-4" /> Convergence Points ({graph.convergencePoints?.length || 0})</h3>
                <p className="text-xs text-muted-foreground mt-1">Where forward and retrospective reasoning converge — these are the points where independent lines of thought meet, tightening the unexplored zone.</p>
              </div>
              {(!graph.convergencePoints || graph.convergencePoints.length === 0) ? (
                <div className="text-center py-8">
                  <Target className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No convergence points identified yet. These emerge when multiple independent reasoning paths arrive at the same conclusions.</p>
                </div>
              ) : graph.convergencePoints.map((cp: ConvergencePoint) => (
                <div key={cp.id} className="p-4 border border-border rounded-lg bg-card">
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {cp.conceptIds.map(cid => {
                      const concept = graph.concepts.find(c => c.id === cid);
                      return concept ? (
                        <button key={cid} onClick={() => { setTab('graph'); setSelectedConcept(cid); }}
                          className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded hover:bg-primary/20 transition-colors">
                          {concept.label}
                        </button>
                      ) : null;
                    })}
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{cp.description}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <ScrollArea className="flex-1 p-6">
            <div className="max-w-3xl mx-auto">
              <h3 className="text-sm font-semibold text-foreground mb-4">Deep Analysis Summary</h3>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{graph.summary || 'No summary available.'}</p>
              </div>
              <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
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
                <div className="p-3 bg-card rounded-lg border border-border">
                  <div className="text-2xl font-bold text-foreground">{graph.convergencePoints?.length || 0}</div>
                  <div className="text-xs text-muted-foreground">Convergence</div>
                </div>
              </div>
              {/* Epistemic status breakdown */}
              <div className="mt-6">
                <h4 className="text-xs font-semibold text-foreground mb-3">Epistemic Landscape</h4>
                <div className="grid grid-cols-2 gap-3">
                  {(['established', 'hypothetical', 'contested', 'emergent'] as const).map(status => {
                    const count = graph.concepts.filter(c => c.epistemicStatus === status).length;
                    const StatusIcon = STATUS_ICONS[status];
                    const color = STATUS_COLORS[status];
                    return (
                      <div key={status} className="flex items-center gap-2 p-2 bg-card rounded border border-border">
                        <StatusIcon className={`h-4 w-4 ${color}`} />
                        <span className="text-xs text-foreground capitalize">{status}</span>
                        <span className="text-xs font-bold text-foreground ml-auto">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
