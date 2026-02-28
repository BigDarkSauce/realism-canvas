import { useCallback, useState } from 'react';
import { useCanvas } from '@/hooks/useCanvas';
import { CanvasBackground, Block } from '@/types/canvas';
import CanvasBlock from './CanvasBlock';
import ConnectionArrows from './ConnectionArrows';
import Toolbar from './Toolbar';
import BlockEditor from './BlockEditor';
import GroupOverlays from './GroupOverlays';
import { cn } from '@/lib/utils';

function getBgClass(bg: CanvasBackground) {
  switch (bg) {
    case 'grid': return 'canvas-grid bg-canvas';
    case 'dots': return 'bg-canvas';
    case 'blueprint': return 'canvas-grid bg-canvas';
    case 'plain': return 'bg-canvas';
    default: return 'canvas-grid bg-canvas';
  }
}

function getBgStyle(bg: CanvasBackground): React.CSSProperties {
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

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;

    if (canvas.tool === 'add') {
      const rect = e.currentTarget.getBoundingClientRect();
      canvas.addBlock(e.clientX - rect.left - 80, e.clientY - rect.top - 28);
      canvas.setTool('select');
    } else {
      canvas.clearSelection();
      canvas.setConnectingFrom(null);
    }
  }, [canvas]);

  const handleConnectStart = useCallback((id: string) => {
    canvas.setConnectingFrom(id);
  }, [canvas]);

  const handleConnectEnd = useCallback((id: string) => {
    if (canvas.connectingFrom && canvas.connectingFrom !== id) {
      canvas.addConnection(canvas.connectingFrom, id);
    }
    canvas.setConnectingFrom(null);
  }, [canvas]);

  const handleDeleteSelected = useCallback(() => {
    canvas.selectedIds.forEach(id => canvas.deleteBlock(id));
  }, [canvas]);

  const getGroupBlockIds = useCallback((blockId: string): string[] => {
    const block = canvas.blocks.find(b => b.id === blockId);
    if (!block?.groupId) return [];
    return canvas.blocks.filter(b => b.groupId === block.groupId).map(b => b.id);
  }, [canvas.blocks]);

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
      />

      <div
        className={cn("w-full h-full relative", getBgClass(canvas.background))}
        style={getBgStyle(canvas.background)}
        onClick={handleCanvasClick}
      >
        <GroupOverlays groups={canvas.groups} blocks={canvas.blocks} />
        <ConnectionArrows
          connections={canvas.connections}
          blocks={canvas.blocks}
          onDelete={canvas.deleteConnection}
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
            groupBlockIds={getGroupBlockIds(block.id)}
          />
        ))}

        {canvas.tool === 'add' && (
          <div className="absolute inset-0 cursor-crosshair" style={{ zIndex: 0 }} />
        )}
      </div>

      <BlockEditor
        block={editingBlock}
        onClose={() => setEditingBlock(null)}
        onSave={canvas.updateBlock}
      />

      {/* Status bar */}
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
