import { useState, useCallback } from 'react';
import { Block, Connection, Group, CanvasTool, CanvasBackground, DrawingStroke } from '@/types/canvas';

let nextId = 1;
const genId = () => `block-${nextId++}`;
const connId = () => `conn-${nextId++}`;
const groupId = () => `group-${nextId++}`;

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

  const addBlock = useCallback((x: number, y: number) => {
    const block: Block = {
      id: genId(),
      x,
      y,
      width: 160,
      height: 56,
      label: 'New Block',
    };
    setBlocks(prev => [...prev, block]);
    return block;
  }, []);

  const updateBlock = useCallback((id: string, updates: Partial<Block>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }, []);

  const deleteBlock = useCallback((id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
    setConnections(prev => prev.filter(c => c.fromId !== id && c.toId !== id));
    setGroups(prev => prev.map(g => ({
      ...g,
      blockIds: g.blockIds.filter(bid => bid !== id),
    })).filter(g => g.blockIds.length > 0));
    setSelectedIds(prev => prev.filter(sid => sid !== id));
  }, []);

  const moveBlock = useCallback((id: string, x: number, y: number) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, x, y } : b));
  }, []);

  const moveGroup = useCallback((groupBlockIds: string[], dx: number, dy: number) => {
    setBlocks(prev => prev.map(b =>
      groupBlockIds.includes(b.id) ? { ...b, x: b.x + dx, y: b.y + dy } : b
    ));
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
    if (selectedIds.length < 2) return;
    const gid = groupId();
    setGroups(prev => {
      const cleaned = prev.map(g => ({
        ...g,
        blockIds: g.blockIds.filter(bid => !selectedIds.includes(bid)),
      })).filter(g => g.blockIds.length > 0);
      return [...cleaned, { id: gid, label: 'Group', blockIds: [...selectedIds] }];
    });
    setBlocks(prev => prev.map(b =>
      selectedIds.includes(b.id) ? { ...b, groupId: gid } : b
    ));
  }, [selectedIds]);

  const ungroupSelected = useCallback(() => {
    const groupIdsToRemove = new Set<string>();
    blocks.forEach(b => {
      if (selectedIds.includes(b.id) && b.groupId) {
        groupIdsToRemove.add(b.groupId);
      }
    });
    setBlocks(prev => prev.map(b =>
      groupIdsToRemove.has(b.groupId || '') ? { ...b, groupId: undefined } : b
    ));
    setGroups(prev => prev.filter(g => !groupIdsToRemove.has(g.id)));
  }, [selectedIds, blocks]);

  const renameGroup = useCallback((groupIdVal: string, newLabel: string) => {
    setGroups(prev => prev.map(g => g.id === groupIdVal ? { ...g, label: newLabel } : g));
  }, []);

  const updateGroup = useCallback((groupIdVal: string, updates: Partial<Group>) => {
    setGroups(prev => prev.map(g => g.id === groupIdVal ? { ...g, ...updates } : g));
  }, []);

  const toggleSelect = useCallback((id: string, multi: boolean) => {
    setSelectedIds(prev => {
      if (multi) {
        return prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id];
      }
      return [id];
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const addStroke = useCallback((stroke: DrawingStroke) => {
    setStrokes(prev => [...prev, stroke]);
  }, []);

  const eraseStroke = useCallback((id: string) => {
    setStrokes(prev => prev.filter(s => s.id !== id));
  }, []);

  return {
    blocks, connections, groups, selectedIds, tool, background,
    connectingFrom, setConnectingFrom,
    strokes, backgroundImage, setBackgroundImage,
    addBlock, updateBlock, deleteBlock, moveBlock, moveGroup,
    addConnection, deleteConnection, updateConnection,
    groupSelected, ungroupSelected, renameGroup, updateGroup,
    toggleSelect, clearSelection,
    setTool, setBackground,
    addStroke, eraseStroke,
  };
}
