import { useState, useRef, useCallback, useEffect } from 'react';
import { FileText, GripVertical, Upload, FolderOpen } from 'lucide-react';
import { Block, CanvasTool } from '@/types/canvas';
import { cn } from '@/lib/utils';
import { uploadAndGetSignedUrl } from '@/lib/storage';

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
  onViewFile: (url: string, fileName?: string) => void;
  onUpdateBlock: (id: string, updates: Partial<Block>) => void;
  groupBlockIds: string[];
}

type ResizeEdge = 'e' | 'w' | 's' | 'n' | 'ne' | 'nw' | 'se' | 'sw' | null;

export default function CanvasBlock({
  block, isSelected, isGrouped, tool,
  onMove, onSelect, onConnectStart, onConnectEnd,
  onDoubleClick, onMoveGroup, onViewFile, onUpdateBlock, groupBlockIds,
}: CanvasBlockProps) {
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, bx: 0, by: 0 });
  const resizeStart = useRef({ x: 0, y: 0, bx: 0, by: 0, bw: 0, bh: 0 });
  const resizeEdgeRef = useRef<ResizeEdge>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MIN_WIDTH = 80;
  const MIN_HEIGHT = 36;

  const handleResizeStart = useCallback((e: React.MouseEvent, edge: ResizeEdge) => {
    e.stopPropagation();
    e.preventDefault();
    setResizing(true);
    resizeEdgeRef.current = edge;
    resizeStart.current = { x: e.clientX, y: e.clientY, bx: block.x, by: block.y, bw: block.width, bh: block.height };

    const handleMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - resizeStart.current.x;
      const dy = ev.clientY - resizeStart.current.y;
      const currentEdge = resizeEdgeRef.current;
      let { bx, by, bw, bh } = resizeStart.current;

      if (currentEdge?.includes('e')) bw = Math.max(MIN_WIDTH, bw + dx);
      if (currentEdge?.includes('w')) { bw = Math.max(MIN_WIDTH, bw - dx); bx = bx + (resizeStart.current.bw - bw); }
      if (currentEdge?.includes('s')) bh = Math.max(MIN_HEIGHT, bh + dy);
      if (currentEdge?.includes('n')) { bh = Math.max(MIN_HEIGHT, bh - dy); by = by + (resizeStart.current.bh - bh); }

      onUpdateBlock(block.id, { width: bw, height: bh });
      if (currentEdge?.includes('w') || currentEdge?.includes('n')) {
        onMove(block.id, bx, by);
      }
    };

    const handleMouseUp = () => {
      setResizing(false);
      resizeEdgeRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [block, onUpdateBlock, onMove]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();

    if (tool === 'connect') {
      onConnectStart(block.id);
      return;
    }
    if (tool !== 'select') return;

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

  const handleOpenFile = useCallback(() => {
    const url = block.fileStorageUrl || block.fileUrl;
    if (url) {
      onViewFile(url, block.fileName || block.label);
    }
  }, [block, onViewFile]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { signedUrl } = await uploadAndGetSignedUrl(file);
      onUpdateBlock(block.id, {
        fileStorageUrl: signedUrl,
        fileName: file.name,
        label: block.label === 'New Block' ? file.name : block.label,
      });
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  }, [block.id, block.label, onUpdateBlock]);


  const hasFile = !!(block.fileStorageUrl || block.fileUrl);

  const handleEdges: { edge: ResizeEdge; className: string; cursor: string }[] = [
    { edge: 'e', className: 'top-0 -right-[4px] w-[8px] h-full', cursor: 'ew-resize' },
    { edge: 'w', className: 'top-0 -left-[4px] w-[8px] h-full', cursor: 'ew-resize' },
    { edge: 's', className: '-bottom-[4px] left-0 h-[8px] w-full', cursor: 'ns-resize' },
    { edge: 'n', className: '-top-[4px] left-0 h-[8px] w-full', cursor: 'ns-resize' },
    { edge: 'se', className: '-bottom-[5px] -right-[5px] w-[10px] h-[10px]', cursor: 'nwse-resize' },
    { edge: 'sw', className: '-bottom-[5px] -left-[5px] w-[10px] h-[10px]', cursor: 'nesw-resize' },
    { edge: 'ne', className: '-top-[5px] -right-[5px] w-[10px] h-[10px]', cursor: 'nesw-resize' },
    { edge: 'nw', className: '-top-[5px] -left-[5px] w-[10px] h-[10px]', cursor: 'nwse-resize' },
  ];

  const shapeClasses = (() => {
    switch (block.shape) {
      case 'circle':
        return 'rounded-full';
      case 'diamond':
        return 'rounded-sm';
      case 'sticky':
        return 'rounded-sm bg-yellow-100 dark:bg-yellow-900/60 border-yellow-400 dark:border-yellow-600 text-yellow-900 dark:text-yellow-100';
      case 'text':
        return 'border-transparent bg-transparent shadow-none hover:shadow-none';
      default:
        return 'rounded-lg';
    }
  })();

  const isDiamond = block.shape === 'diamond';
  const isTextOnly = block.shape === 'text';

  return (
    <div
      className={cn(
        "absolute select-none cursor-grab flex items-center gap-2 border-2 transition-shadow font-mono text-sm font-medium",
        !isTextOnly && "bg-block border-block-border shadow-sm hover:shadow-md hover:border-block-hover",
        shapeClasses,
        isSelected && "border-primary shadow-md ring-2 ring-primary/20",
        isGrouped && "border-group-border",
        dragging && "cursor-grabbing shadow-lg opacity-90 z-50",
        resizing && "z-50",
        tool === 'connect' && "cursor-crosshair",
      )}
      style={{
        left: block.x,
        top: block.y,
        width: block.width,
        height: block.height,
        zIndex: dragging || resizing ? 50 : 10,
        fontSize: block.fontSize || undefined,
        transform: isDiamond ? 'rotate(45deg)' : undefined,
        ...(block.bgColor && block.shape !== 'sticky' ? { background: block.bgColor } : {}),
        ...(block.borderColor ? { borderColor: block.borderColor } : {}),
        ...(block.textColor ? { color: block.textColor } : {}),
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(block); }}
      tabIndex={0}
    >
      <div
        className={cn("flex items-center gap-2 w-full h-full px-3 py-2 overflow-hidden", isDiamond && "justify-center")}
        style={isDiamond ? { transform: 'rotate(-45deg)' } : undefined}
      >
        {!isDiamond && <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />}
        <span className="truncate flex-1 text-center">{uploading ? 'Uploading...' : block.label}</span>
        {hasFile && (
          <button
            className="h-6 w-6 flex items-center justify-center rounded border border-primary/30 bg-primary/10 hover:bg-primary/20 shrink-0"
            title="Open file"
            onClick={(e) => { e.stopPropagation(); handleOpenFile(); }}
          >
            <FolderOpen className="h-3.5 w-3.5 text-primary" />
          </button>
        )}
        <button
          className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent shrink-0"
          title="Upload file"
          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
        >
          <Upload className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileUpload}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.mp4,.webm,.ogg,.svg,.txt"
      />

      {/* Resize handles on edges and corners - visible when selected */}
      {isSelected && tool === 'select' && handleEdges.map(({ edge, className, cursor }) => (
        <div
          key={edge}
          className={cn("absolute z-20", className)}
          style={{ cursor }}
          onMouseDown={(e) => handleResizeStart(e, edge)}
        />
      ))}
    </div>
  );
}
