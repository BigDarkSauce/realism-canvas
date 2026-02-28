import { useState, useRef, useCallback } from 'react';
import { FileText, GripVertical } from 'lucide-react';
import { Block, CanvasTool } from '@/types/canvas';
import { cn } from '@/lib/utils';

interface CanvasBlockProps {
  block: Block;
  isSelected: boolean;
  isGrouped: boolean;
  tool: CanvasTool;
  onMove: (id: string, x: number, y: number) => void;
  onSelect: (id: string, multi: boolean) => void;
  onConnectStart: (id: string) => void;
  onConnectEnd: (id: string) => void;
  onDoubleClick: (block: Block) => void;
  onMoveGroup: (blockIds: string[], dx: number, dy: number) => void;
  groupBlockIds: string[];
}

export default function CanvasBlock({
  block, isSelected, isGrouped, tool,
  onMove, onSelect, onConnectStart, onConnectEnd,
  onDoubleClick, onMoveGroup, groupBlockIds,
}: CanvasBlockProps) {
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, bx: 0, by: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();

    if (tool === 'connect') {
      onConnectStart(block.id);
      return;
    }

    onSelect(block.id, e.shiftKey || e.metaKey);
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, bx: block.x, by: block.y };

    const handleMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - dragStart.current.x;
      const dy = ev.clientY - dragStart.current.y;

      if (isGrouped && groupBlockIds.length > 0) {
        onMoveGroup(groupBlockIds, dx, dy);
        dragStart.current.x = ev.clientX;
        dragStart.current.y = ev.clientY;
      } else {
        onMove(block.id, dragStart.current.bx + dx, dragStart.current.by + dy);
      }
    };

    const handleMouseUp = () => {
      setDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [block, tool, isGrouped, groupBlockIds, onMove, onSelect, onConnectStart, onMoveGroup]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (tool === 'connect') {
      e.stopPropagation();
      onConnectEnd(block.id);
    }
  }, [tool, block.id, onConnectEnd]);

  const handleClick = useCallback(() => {
    if (block.fileUrl && tool === 'select') {
      window.open(block.fileUrl, '_blank');
    }
  }, [block.fileUrl, tool]);

  return (
    <div
      className={cn(
        "absolute select-none cursor-grab flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-shadow font-mono text-sm font-medium",
        "bg-block border-block-border shadow-sm",
        "hover:shadow-md hover:border-block-hover",
        isSelected && "border-primary shadow-md ring-2 ring-primary/20",
        isGrouped && "border-group-border",
        dragging && "cursor-grabbing shadow-lg opacity-90 z-50",
        tool === 'connect' && "cursor-crosshair",
      )}
      style={{
        left: block.x,
        top: block.y,
        width: block.width,
        height: block.height,
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onDoubleClick={() => onDoubleClick(block)}
      onClick={handleClick}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="truncate flex-1">{block.label}</span>
      {block.fileName && (
        <FileText className="h-4 w-4 text-primary shrink-0" />
      )}
    </div>
  );
}
