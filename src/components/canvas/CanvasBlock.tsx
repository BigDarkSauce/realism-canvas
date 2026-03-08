import { useState, useRef, useCallback, useEffect } from 'react';
import { FileText, GripVertical, Upload, FolderOpen } from 'lucide-react';
import { Block, CanvasTool } from '@/types/canvas';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

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

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'o' || e.key === 'O') {
      const url = block.fileStorageUrl || block.fileUrl;
      if (url && isSelected) {
        onViewFile(url, block.fileName || block.label);
      }
    }
  }, [block, isSelected, onViewFile]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('canvas-files').upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('canvas-files').getPublicUrl(path);
      onUpdateBlock(block.id, {
        fileStorageUrl: publicUrl,
        fileName: file.name,
        label: block.label === 'New Block' ? file.name : block.label,
      });
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  }, [block.id, block.label, onUpdateBlock]);

  useEffect(() => {
    if (isSelected) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isSelected, handleKeyDown]);

  const hasFile = !!(block.fileStorageUrl || block.fileUrl);
  const hintText = hasFile && isSelected ? ' (press O to open)' : '';

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

  return (
    <div
      className={cn(
        "absolute select-none cursor-grab flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-shadow font-mono text-sm font-medium",
        "bg-block border-block-border shadow-sm",
        "hover:shadow-md hover:border-block-hover",
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
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(block); }}
      tabIndex={0}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="truncate flex-1">{uploading ? 'Uploading...' : block.label}{hintText}</span>
      {hasFile && (
        <FileText className="h-4 w-4 text-primary shrink-0" />
      )}
      <button
        className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent shrink-0"
        title="Upload file"
        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
      >
        <Upload className="h-3 w-3 text-muted-foreground" />
      </button>
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
