import { useCallback, useRef, useState, useEffect } from 'react';
import { useCanvas } from '@/hooks/useCanvas';
import { CanvasBackground, Block } from '@/types/canvas';
import CanvasBlock from './CanvasBlock';
import ConnectionArrows from './ConnectionArrows';
import Toolbar from './Toolbar';
import BlockEditor from './BlockEditor';
import GroupOverlays from './GroupOverlays';
import FileViewer from './FileViewer';
import DrawingCanvas from './DrawingCanvas';
import DrawingToolbar from './DrawingToolbar';
import BlockSearch from './BlockSearch';
import CanvasBorderHandles, { EXTEND_AMOUNT } from './CanvasBorderHandles';
import SaveLoadPanel from './SaveLoadPanel';
import OuterBackgroundPicker from './OuterBackgroundPicker';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeSelector';

function getBgClass(bg: CanvasBackground) {
  switch (bg) {
    case 'grid': return 'canvas-grid bg-canvas';
    case 'dots': return 'bg-canvas';
    case 'blueprint': return 'bg-canvas';
    case 'plain': return 'bg-canvas';
    case 'image': return '';
    default: return 'canvas-grid bg-canvas';
  }
}

function getBgStyle(bg: CanvasBackground, bgImage?: string | null): React.CSSProperties {
  if (bg === 'image' && bgImage) {
    return { backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  if (bg === 'dots') {
    return { backgroundSize: '20px 20px', backgroundImage: 'radial-gradient(circle, hsl(var(--canvas-grid)) 1px, transparent 1px)' };
  }
  if (bg === 'blueprint') {
    return { backgroundSize: '20px 20px', backgroundImage: 'linear-gradient(to right, hsl(173 58% 39% / 0.08) 1px, transparent 1px), linear-gradient(to bottom, hsl(173 58% 39% / 0.08) 1px, transparent 1px)' };
  }
  return {};
}

const INITIAL_CANVAS_SIZE = { width: 2000, height: 1500 };

interface CanvasProps {
  documentId: string;
  onBackToMenu: () => void;
}

export default function Canvas({ documentId, onBackToMenu }: CanvasProps) {
  const canvas = useCanvas();
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [viewingFile, setViewingFile] = useState<{ url: string; fileName?: string } | null>(null);
  const [drawColor, setDrawColor] = useState('#000000');
  const [brushWidth, setBrushWidth] = useState(3);
  const [outerBg, setOuterBg] = useState('');
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.2);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const [canvasSize, setCanvasSize] = useState(INITIAL_CANVAS_SIZE);
  const clipboard = useRef<Block[]>([]);

  // Load document state on mount
  useEffect(() => {
    const loadDocument = async () => {
      const { data } = await supabase
        .from('canvas_documents')
        .select('canvas_data')
        .eq('id', documentId)
        .maybeSingle();
      if (data?.canvas_data && typeof data.canvas_data === 'object' && 'blocks' in (data.canvas_data as any)) {
        const state = data.canvas_data as any;
        canvas.loadState(state);
        if (state.canvasSize) setCanvasSize(state.canvasSize);
      }
    };
    loadDocument();
  }, [documentId]);

  // Auto-save document state periodically
  useEffect(() => {
    const interval = setInterval(async () => {
      const state = {
        blocks: canvas.blocks,
        connections: canvas.connections,
        groups: canvas.groups,
        strokes: canvas.strokes,
        background: canvas.background,
        backgroundImage: canvas.backgroundImage,
        canvasSize,
      };
      await supabase
        .from('canvas_documents')
        .update({ canvas_data: JSON.parse(JSON.stringify(state)) })
        .eq('id', documentId);
    }, 30000);
    return () => clearInterval(interval);
  }, [canvas.blocks, canvas.connections, canvas.groups, canvas.strokes, canvas.background, canvas.backgroundImage, canvasSize, documentId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        const selected = canvas.blocks.filter(b => canvas.selectedIds.includes(b.id));
        if (selected.length > 0) clipboard.current = selected.map(b => ({ ...b }));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        if (clipboard.current.length > 0) {
          const newIds: string[] = [];
          clipboard.current.forEach(b => {
            const newBlock = canvas.addBlock(b.x + 30, b.y + 30);
            canvas.updateBlock(newBlock.id, { label: b.label, width: b.width, height: b.height, fontSize: b.fontSize, fileUrl: b.fileUrl, fileStorageUrl: b.fileStorageUrl, fileName: b.fileName });
            newIds.push(newBlock.id);
          });
          canvas.clearSelection();
          newIds.forEach(id => canvas.toggleSelect(id, true));
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        canvas.selectedIds.forEach(id => canvas.deleteBlock(id));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canvas.blocks, canvas.selectedIds, canvas.addBlock, canvas.updateBlock, canvas.clearSelection, canvas.toggleSelect, canvas.deleteBlock]);

  const handleExtend = useCallback((direction: 'top' | 'bottom' | 'left' | 'right') => {
    setCanvasSize(prev => {
      switch (direction) {
        case 'top':
          canvas.blocks.forEach(b => canvas.moveBlock(b.id, b.x, b.y + EXTEND_AMOUNT));
          setPan(p => ({ ...p, y: p.y - EXTEND_AMOUNT * zoom }));
          return { ...prev, height: prev.height + EXTEND_AMOUNT };
        case 'bottom': return { ...prev, height: prev.height + EXTEND_AMOUNT };
        case 'left':
          canvas.blocks.forEach(b => canvas.moveBlock(b.id, b.x + EXTEND_AMOUNT, b.y));
          setPan(p => ({ ...p, x: p.x - EXTEND_AMOUNT * zoom }));
          return { ...prev, width: prev.width + EXTEND_AMOUNT };
        case 'right': return { ...prev, width: prev.width + EXTEND_AMOUNT };
      }
    });
  }, [canvas.blocks, canvas.moveBlock, zoom]);

  const handleNavigateToBlock = useCallback((block: Block) => {
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    setPan({ x: -(block.x + block.width / 2) * zoom + viewportW / 2, y: -(block.y + block.height / 2) * zoom + viewportH / 2 });
    canvas.clearSelection();
    canvas.toggleSelect(block.id, false);
  }, [zoom, canvas.clearSelection, canvas.toggleSelect]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    setPan(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
  }, []);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const isCanvas = target === canvasRef.current || target.dataset.canvasBg === 'true';
    if (!isCanvas) return;
    if (e.button === 1) {
      e.preventDefault();
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      const handleMove = (ev: MouseEvent) => { setPan({ x: panStart.current.px + (ev.clientX - panStart.current.x), y: panStart.current.py + (ev.clientY - panStart.current.y) }); };
      const handleUp = () => { isPanning.current = false; window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
      return;
    }
    if (canvas.tool === 'add') {
      const rect = canvasRef.current!.getBoundingClientRect();
      canvas.addBlock((e.clientX - rect.left - pan.x) / zoom - 80, (e.clientY - rect.top - pan.y) / zoom - 28);
      canvas.setTool('select');
    } else if (canvas.tool === 'select') {
      canvas.clearSelection();
      canvas.setConnectingFrom(null);
    }
  }, [canvas.tool, canvas.addBlock, canvas.setTool, canvas.clearSelection, canvas.setConnectingFrom, zoom, pan]);

  const handleConnectStart = useCallback((id: string) => { canvas.setConnectingFrom(id); }, [canvas.setConnectingFrom]);
  const handleConnectEnd = useCallback((id: string) => {
    if (canvas.connectingFrom && canvas.connectingFrom !== id) canvas.addConnection(canvas.connectingFrom, id);
    canvas.setConnectingFrom(null);
  }, [canvas.connectingFrom, canvas.addConnection, canvas.setConnectingFrom]);

  const handleDeleteSelected = useCallback(() => { canvas.selectedIds.forEach(id => canvas.deleteBlock(id)); }, [canvas.selectedIds, canvas.deleteBlock]);

  const getGroupBlockIds = useCallback((blockId: string): string[] => {
    const block = canvas.blocks.find(b => b.id === blockId);
    if (!block?.groupId) return [];
    return canvas.blocks.filter(b => b.groupId === block.groupId).map(b => b.id);
  }, [canvas.blocks]);

  const handleBackgroundImageUpload = useCallback(async (file: File) => {
    try {
      const path = `bg-${Date.now()}.${file.name.split('.').pop()}`;
      const { error } = await supabase.storage.from('canvas-files').upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('canvas-files').getPublicUrl(path);
      canvas.setBackgroundImage(publicUrl);
      canvas.setBackground('image' as CanvasBackground);
    } catch (err) { console.error('Background upload failed:', err); }
  }, [canvas.setBackgroundImage, canvas.setBackground]);

  // Save state before leaving
  const handleBackToMenu = async () => {
    const state = {
      blocks: canvas.blocks, connections: canvas.connections, groups: canvas.groups,
      strokes: canvas.strokes, background: canvas.background, backgroundImage: canvas.backgroundImage, canvasSize,
    };
    await supabase.from('canvas_documents').update({ canvas_data: JSON.parse(JSON.stringify(state)) }).eq('id', documentId);
    onBackToMenu();
  };

  return (
    <div className="relative w-full h-screen overflow-hidden" style={outerBg ? { backgroundColor: outerBg } : undefined}>
      <Toolbar
        tool={canvas.tool} setTool={canvas.setTool}
        background={canvas.background} setBackground={canvas.setBackground}
        hasSelection={canvas.selectedIds.length > 0} multiSelected={canvas.selectedIds.length > 1}
        onDelete={handleDeleteSelected} onGroup={canvas.groupSelected} onUngroup={canvas.ungroupSelected}
        onBackgroundImageUpload={handleBackgroundImageUpload}
      />

      {/* Back to menu + zoom slider + theme toggle */}
      <div className="absolute top-4 left-4 z-50 flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleBackToMenu} className="h-9 gap-2 bg-toolbar border-toolbar-border">
          <ArrowLeft className="h-4 w-4" /> Menu
        </Button>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-toolbar border border-toolbar-border rounded-xl">
          <span className="text-xs font-mono text-muted-foreground w-8 text-right">{Math.round(zoom * 100)}%</span>
          <input
            type="range"
            min={10}
            max={50}
            value={Math.round(zoom * 100)}
            onChange={e => setZoom(Number(e.target.value) / 100)}
            className="w-24 h-1.5 accent-primary cursor-pointer"
            title="Zoom"
          />
        </div>
        <ThemeToggle />
      </div>

      {/* Top-right controls */}
      <div className="absolute top-4 right-4 z-50 flex flex-col items-end gap-2">
        <div className="flex items-center gap-1">
          <OuterBackgroundPicker value={outerBg} onChange={setOuterBg} />
          <SaveLoadPanel
            documentId={documentId}
            getCanvasState={() => ({
              blocks: canvas.blocks, connections: canvas.connections, groups: canvas.groups,
              strokes: canvas.strokes, background: canvas.background, backgroundImage: canvas.backgroundImage, canvasSize,
            })}
            loadCanvasState={(state) => { canvas.loadState(state); if (state.canvasSize) setCanvasSize(state.canvasSize); }}
          />
        </div>
        <div className="flex items-center gap-1">
          <BlockSearch blocks={canvas.blocks} onNavigateTo={handleNavigateToBlock} />
          <DrawingToolbar tool={canvas.tool} setTool={canvas.setTool} color={drawColor} setColor={setDrawColor} brushWidth={brushWidth} setBrushWidth={setBrushWidth} />
        </div>
      </div>

      <CanvasBorderHandles canvasSize={canvasSize} onExtend={handleExtend} pan={pan} zoom={zoom} />




      <div ref={canvasRef} className={cn("w-full h-full relative overflow-hidden", canvas.tool === 'add' && 'cursor-crosshair')} onMouseDown={handleCanvasMouseDown} onWheel={handleWheel}>
        <div data-canvas-bg="true" className="absolute inset-0 bg-muted/30" style={{ zIndex: 0 }} />
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', position: 'absolute', top: 0, left: 0, width: canvasSize.width, height: canvasSize.height }}>
          <div data-canvas-bg="true" className={cn("absolute inset-0 rounded-sm", getBgClass(canvas.background))} style={{ ...getBgStyle(canvas.background, canvas.backgroundImage), boxShadow: '0 0 0 1px hsl(var(--border))' }} />
          <DrawingCanvas strokes={canvas.strokes} currentColor={drawColor} currentWidth={brushWidth} tool={canvas.tool} onAddStroke={canvas.addStroke} onEraseStroke={canvas.eraseStroke} />
          <GroupOverlays groups={canvas.groups} blocks={canvas.blocks} onRenameGroup={canvas.renameGroup} onUpdateGroup={canvas.updateGroup} />
          <ConnectionArrows connections={canvas.connections} blocks={canvas.blocks} tool={canvas.tool} zoom={zoom} pan={pan} onDelete={canvas.deleteConnection} onUpdateConnection={canvas.updateConnection} />
          {canvas.blocks.map(block => (
            <CanvasBlock key={block.id} block={block} isSelected={canvas.selectedIds.includes(block.id)} isGrouped={!!block.groupId} tool={canvas.tool}
              onMove={canvas.moveBlock} onSelect={canvas.toggleSelect} onConnectStart={handleConnectStart} onConnectEnd={handleConnectEnd}
              onDoubleClick={setEditingBlock} onMoveGroup={canvas.moveGroup} onViewFile={(url, fileName) => setViewingFile({ url, fileName })}
              onUpdateBlock={canvas.updateBlock} groupBlockIds={getGroupBlockIds(block.id)} />
          ))}
        </div>
      </div>

      <BlockEditor block={editingBlock} onClose={() => setEditingBlock(null)} onSave={canvas.updateBlock} />
      {viewingFile && <FileViewer url={viewingFile.url} fileName={viewingFile.fileName} onClose={() => setViewingFile(null)} />}

      <div className="absolute bottom-4 left-4 z-50 flex items-center gap-3 px-3 py-1.5 bg-toolbar/80 backdrop-blur border border-toolbar-border rounded-lg text-xs font-mono text-muted-foreground">
        <span>{canvas.blocks.length} blocks</span><span>·</span>
        <span>{canvas.connections.length} connections</span><span>·</span>
        <span>{canvasSize.width}×{canvasSize.height}</span>
        {canvas.connectingFrom && <><span>·</span><span className="text-primary">Click target block to connect</span></>}
      </div>
    </div>
  );
}
