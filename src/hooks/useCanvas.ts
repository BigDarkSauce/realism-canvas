import { useState, useCallback, useRef, useEffect } from 'react';
import { Block, Connection, Group, CanvasTool, CanvasBackground, DrawingStroke, KnowledgeGraphData } from '@/types/canvas';

let nextId = 1;
const genId = () => `block-${nextId++}`;
const connId = () => `conn-${nextId++}`;
const groupId = () => `group-${nextId++}`;

interface CanvasSnapshot {
  blocks: Block[];
  connections: Connection[];
  groups: Group[];
  strokes: DrawingStroke[];
}

const MAX_HISTORY = 50;

export function useCanvas() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setTool] = useState<CanvasTool>('select');
  const [background, setBackground] = useState<CanvasBackground>('grid');
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [knowledgeGraph, setKnowledgeGraph] = useState<KnowledgeGraphData | null>(null);

  // Refs for callbacks
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  // Undo/Redo
  const historyRef = useRef<CanvasSnapshot[]>([]);
  const historyIndexRef = useRef(-1);
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRestoringRef = useRef(false);

  // Push snapshot on state change (debounced)
  useEffect(() => {
    if (isRestoringRef.current) { isRestoringRef.current = false; return; }
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    historyTimerRef.current = setTimeout(() => {
      const snapshot: CanvasSnapshot = {
        blocks: JSON.parse(JSON.stringify(blocks)),
        connections: JSON.parse(JSON.stringify(connections)),
        groups: JSON.parse(JSON.stringify(groups)),
        strokes: JSON.parse(JSON.stringify(strokes)),
      };
      const history = historyRef.current.slice(0, historyIndexRef.current + 1);
      history.push(snapshot);
      if (history.length > MAX_HISTORY) history.shift();
      historyRef.current = history;
      historyIndexRef.current = history.length - 1;
    }, 400);
  }, [blocks, connections, groups, strokes]);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return false;
    historyIndexRef.current--;
    const snap = historyRef.current[historyIndexRef.current];
    isRestoringRef.current = true;
    setBlocks(snap.blocks);
    setConnections(snap.connections);
    setGroups(snap.groups);
    setStrokes(snap.strokes);
    return true;
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return false;
    historyIndexRef.current++;
    const snap = historyRef.current[historyIndexRef.current];
    isRestoringRef.current = true;
    setBlocks(snap.blocks);
    setConnections(snap.connections);
    setGroups(snap.groups);
    setStrokes(snap.strokes);
    return true;
  }, []);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const addBlock = useCallback((x: number, y: number, overrides?: Partial<Block>) => {
    const block: Block = { id: genId(), x, y, width: 160, height: 56, label: 'New Block', ...overrides };
    setBlocks(prev => [...prev, block]);
    return block;
  }, []);

  const addBlocksBatch = useCallback((newBlocks: Block[]) => {
    setBlocks(prev => [...prev, ...newBlocks]);
  }, []);

  const addConnectionsBatch = useCallback((newConns: { fromId: string; toId: string }[]) => {
    setConnections(prev => [...prev, ...newConns.map(c => ({ id: connId(), fromId: c.fromId, toId: c.toId }))]);
  }, []);

  const updateBlock = useCallback((id: string, updates: Partial<Block>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }, []);

  const deleteBlock = useCallback((id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
    setConnections(prev => prev.filter(c => c.fromId !== id && c.toId !== id));
    setGroups(prev => prev.map(g => ({ ...g, blockIds: g.blockIds.filter(bid => bid !== id) })).filter(g => g.blockIds.length > 0));
    setSelectedIds(prev => prev.filter(sid => sid !== id));
  }, []);

  const moveBlock = useCallback((id: string, x: number, y: number) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, x, y } : b));
  }, []);

  const moveGroup = useCallback((groupBlockIds: string[], dx: number, dy: number) => {
    const idSet = new Set(groupBlockIds);
    setBlocks(prev => prev.map(b => idSet.has(b.id) ? { ...b, x: b.x + dx, y: b.y + dy } : b));
  }, []);

  const addConnection = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    setConnections(prev => {
      if (prev.some(c => c.fromId === fromId && c.toId === toId)) return prev;
      return [...prev, { id: connId(), fromId, toId }];
    });
  }, []);

  const deleteConnection = useCallback((id: string) => {
    setConnections(prev => prev.filter(c => c.id !== id));
  }, []);

  const updateConnection = useCallback((id: string, updates: Partial<Connection>) => {
    setConnections(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const groupSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.length < 2) return;
    const gid = groupId();
    const idSet = new Set(ids);
    setGroups(prev => {
      const cleaned = prev.map(g => ({ ...g, blockIds: g.blockIds.filter(bid => !idSet.has(bid)) })).filter(g => g.blockIds.length > 0);
      return [...cleaned, { id: gid, label: 'Group', blockIds: [...ids] }];
    });
    setBlocks(prev => prev.map(b => idSet.has(b.id) ? { ...b, groupId: gid } : b));
  }, []);

  const ungroupSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    const currentBlocks = blocksRef.current;
    const groupIdsToRemove = new Set<string>();
    currentBlocks.forEach(b => { if (ids.includes(b.id) && b.groupId) groupIdsToRemove.add(b.groupId); });
    if (groupIdsToRemove.size === 0) return;
    setBlocks(prev => prev.map(b => groupIdsToRemove.has(b.groupId || '') ? { ...b, groupId: undefined } : b));
    setGroups(prev => prev.filter(g => !groupIdsToRemove.has(g.id)));
  }, []);

  const renameGroup = useCallback((groupIdVal: string, newLabel: string) => {
    setGroups(prev => prev.map(g => g.id === groupIdVal ? { ...g, label: newLabel } : g));
  }, []);

  const updateGroup = useCallback((groupIdVal: string, updates: Partial<Group>) => {
    setGroups(prev => prev.map(g => g.id === groupIdVal ? { ...g, ...updates } : g));
  }, []);

  const toggleSelect = useCallback((id: string, multi: boolean) => {
    setSelectedIds(prev => multi ? (prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]) : [id]);
  }, []);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const addStroke = useCallback((stroke: DrawingStroke) => { setStrokes(prev => [...prev, stroke]); }, []);
  const eraseStroke = useCallback((id: string) => { setStrokes(prev => prev.filter(s => s.id !== id)); }, []);
  const eraseStrokes = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setStrokes(prev => prev.filter(stroke => !idSet.has(stroke.id)));
  }, []);

  const loadState = useCallback((state: {
    blocks: Block[]; connections: Connection[]; groups: Group[]; strokes: DrawingStroke[];
    background: CanvasBackground; backgroundImage: string | null; knowledgeGraph?: KnowledgeGraphData | null;
  }) => {
    isRestoringRef.current = true;
    setBlocks(state.blocks || []);
    setConnections(state.connections || []);
    setGroups(state.groups || []);
    setStrokes(state.strokes || []);
    setBackground(state.background || 'grid');
    setBackgroundImage(state.backgroundImage || null);
    setKnowledgeGraph(state.knowledgeGraph || null);
    setSelectedIds([]);
    historyRef.current = [];
    historyIndexRef.current = -1;
    const allIds = [...(state.blocks || []), ...(state.connections || []), ...(state.groups || [])];
    const maxNum = allIds.reduce((max, item) => {
      const match = item.id.match(/\d+/);
      return match ? Math.max(max, parseInt(match[0])) : max;
    }, 0);
    nextId = maxNum + 1;
  }, []);

  return {
    blocks, connections, groups, selectedIds, tool, background,
    connectingFrom, setConnectingFrom,
    strokes, backgroundImage, setBackgroundImage,
    knowledgeGraph, setKnowledgeGraph,
    addBlock, addBlocksBatch, addConnectionsBatch,
    updateBlock, deleteBlock, moveBlock, moveGroup,
    addConnection, deleteConnection, updateConnection,
    groupSelected, ungroupSelected, renameGroup, updateGroup,
    toggleSelect, clearSelection,
    setTool, setBackground,
    addStroke, eraseStroke, eraseStrokes,
    undo, redo, canUndo, canRedo,
    loadState,
  };
}
