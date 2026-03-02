import { useCallback, useRef, useState } from 'react';
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
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

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
    return {
      backgroundImage: `url(${bgImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  if (bg === 'dots') {
    return {
      backgroundSize: '20px 20px',
      backgroundImage: 'radial-gradient(circle, hsl(var(--canvas-grid)) 1px, transparent 1px)',
    };
  }
  if (bg === 'blueprint') {
    return {
      backgroundSize: '20px 20px',
      backgroundImage:
        'linear-gradient(to right, hsl(173 58% 39% / 0.08) 1px, transparent 1px), linear-gradient(to bottom, hsl(173 58% 39% / 0.08) 1px, transparent 1px)',
    };
  }
  return {};
}

export default function Canvas() {
  const canvas = useCanvas();
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [viewingFile, setViewingFile] = useState<{ url: string; fileName?: string } | null>(null);
  const [drawColor, setDrawColor] = useState('#000000');
  const [brushWidth, setBrushWidth] = useState(3);
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const isCanvas = target === canvasRef.current || target.dataset.canvasBg === 'true';
    if (!isCanvas) return;

    if (canvas.tool === 'add') {
      const rect = canvasRef.current!.getBoundingClientRect();
      canvas.addBlock(e.clientX - rect.left - 80, e.clientY - rect.top - 28);
      canvas.setTool('select');
    } else if (canvas.tool === 'select') {
      canvas.clearSelection();
      canvas.setConnectingFrom(null);
    }
  }, [canvas.tool, canvas.addBlock, canvas.setTool, canvas.clearSelection, canvas.setConnectingFrom]);

  const handleConnectStart = useCallback((id: string) => {
    canvas.setConnectingFrom(id);
  }, [canvas.setConnectingFrom]);

  const handleConnectEnd = useCallback((id: string) => {
    if (canvas.connectingFrom && canvas.connectingFrom !== id) {
      canvas.addConnection(canvas.connectingFrom, id);
    }
    canvas.setConnectingFrom(null);
  }, [canvas.connectingFrom, canvas.addConnection, canvas.setConnectingFrom]);

  const handleDeleteSelected = useCallback(() => {
    canvas.selectedIds.forEach(id => canvas.deleteBlock(id));
  }, [canvas.selectedIds, canvas.deleteBlock]);

  const getGroupBlockIds = useCallback((blockId: string): string[] => {
    const block = canvas.blocks.find(b => b.id === blockId);
    if (!block?.groupId) return [];
    return canvas.blocks.filter(b => b.groupId === block.groupId).map(b => b.id);
  }, [canvas.blocks]);

  const handleBackgroundImageUpload = useCallback(async (file: File) => {
    try {
      const ext = file.name.split('.').pop();
      const path = `bg-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('canvas-files').upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('canvas-files').getPublicUrl(path);
      canvas.setBackgroundImage(publicUrl);
      canvas.setBackground('image' as CanvasBackground);
    } catch (err) {
      console.error('Background upload failed:', err);
    }
  }, [canvas.setBackgroundImage, canvas.setBackground]);

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <Toolbar
        tool={canvas.tool}
        setTool={canvas.setTool}
        background={canvas.background}
        setBackground={canvas.setBackground}
        hasSelection={canvas.selectedIds.length > 0}
        multiSelected={canvas.selectedIds.length > 1}
        onDelete={handleDeleteSelected}
        onGroup={canvas.groupSelected}
        onUngroup={canvas.ungroupSelected}
        onBackgroundImageUpload={handleBackgroundImageUpload}
      />

      <DrawingToolbar
        tool={canvas.tool}
        setTool={canvas.setTool}
        color={drawColor}
        setColor={setDrawColor}
        brushWidth={brushWidth}
        setBrushWidth={setBrushWidth}
      />

      <div
        ref={canvasRef}
        className={cn(
          "w-full h-full relative",
          getBgClass(canvas.background),
          canvas.tool === 'add' && 'cursor-crosshair',
        )}
        style={getBgStyle(canvas.background, canvas.backgroundImage)}
        onMouseDown={handleCanvasMouseDown}
      >
        <div
          data-canvas-bg="true"
          className="absolute inset-0"
          style={{ zIndex: 0 }}
        />

        <DrawingCanvas
          strokes={canvas.strokes}
          currentColor={drawColor}
          currentWidth={brushWidth}
          tool={canvas.tool}
          onAddStroke={canvas.addStroke}
          onEraseStroke={canvas.eraseStroke}
        />

        <GroupOverlays
          groups={canvas.groups}
          blocks={canvas.blocks}
          onRenameGroup={canvas.renameGroup}
        />
        <ConnectionArrows
          connections={canvas.connections}
          blocks={canvas.blocks}
          tool={canvas.tool}
          onDelete={canvas.deleteConnection}
          onUpdateConnection={canvas.updateConnection}
        />
        {canvas.blocks.map(block => (
          <CanvasBlock
            key={block.id}
            block={block}
            isSelected={canvas.selectedIds.includes(block.id)}
            isGrouped={!!block.groupId}
            tool={canvas.tool}
            onMove={canvas.moveBlock}
            onSelect={canvas.toggleSelect}
            onConnectStart={handleConnectStart}
            onConnectEnd={handleConnectEnd}
            onDoubleClick={setEditingBlock}
            onMoveGroup={canvas.moveGroup}
            onViewFile={(url, fileName) => setViewingFile({ url, fileName })}
            onUpdateBlock={canvas.updateBlock}
            groupBlockIds={getGroupBlockIds(block.id)}
          />
        ))}
      </div>

      <BlockEditor
        block={editingBlock}
        onClose={() => setEditingBlock(null)}
        onSave={canvas.updateBlock}
      />

      {viewingFile && (
        <FileViewer
          url={viewingFile.url}
          fileName={viewingFile.fileName}
          onClose={() => setViewingFile(null)}
        />
      )}

      <div className="absolute bottom-4 left-4 z-50 flex items-center gap-3 px-3 py-1.5 bg-toolbar/80 backdrop-blur border border-toolbar-border rounded-lg text-xs font-mono text-muted-foreground">
        <span>{canvas.blocks.length} blocks</span>
        <span>·</span>
        <span>{canvas.connections.length} connections</span>
        {canvas.connectingFrom && (
          <>
            <span>·</span>
            <span className="text-primary">Click target block to connect</span>
          </>
        )}
      </div>
    </div>
  );
}
