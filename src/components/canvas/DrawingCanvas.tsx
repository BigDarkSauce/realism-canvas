import { useRef, useCallback, useEffect } from 'react';
import { DrawingStroke, CanvasTool } from '@/types/canvas';

interface DrawingCanvasProps {
  strokes: DrawingStroke[];
  currentColor: string;
  currentWidth: number;
  tool: CanvasTool;
  onAddStroke: (stroke: DrawingStroke) => void;
  onEraseStroke: (id: string) => void;
}

let strokeIdCounter = 0;

export default function DrawingCanvas({ strokes, currentColor, currentWidth, tool, onAddStroke, onEraseStroke }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const currentPoints = useRef<{ x: number; y: number }[]>([]);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const onEraseStrokeRef = useRef(onEraseStroke);
  onEraseStrokeRef.current = onEraseStroke;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }

    if (currentPoints.current.length >= 2) {
      ctx.beginPath();
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(currentPoints.current[0].x, currentPoints.current[0].y);
      for (let i = 1; i < currentPoints.current.length; i++) {
        ctx.lineTo(currentPoints.current[i].x, currentPoints.current[i].y);
      }
      ctx.stroke();
    }
  }, [strokes, currentColor, currentWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
      redraw();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [redraw]);

  useEffect(() => { redraw(); }, [redraw]);

  const getPos = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const eraseAtPos = (pos: { x: number; y: number }) => {
    const erasedIds = new Set<string>();
    for (const stroke of strokesRef.current) {
      if (erasedIds.has(stroke.id)) continue;
      for (const pt of stroke.points) {
        const dist = Math.hypot(pt.x - pos.x, pt.y - pos.y);
        if (dist < 15) {
          erasedIds.add(stroke.id);
          onEraseStrokeRef.current(stroke.id);
          break;
        }
      }
    }
  };

  const toolRef = useRef(tool);
  toolRef.current = tool;
  const currentColorRef = useRef(currentColor);
  currentColorRef.current = currentColor;
  const currentWidthRef = useRef(currentWidth);
  currentWidthRef.current = currentWidth;
  const onAddStrokeRef = useRef(onAddStroke);
  onAddStrokeRef.current = onAddStroke;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const t = toolRef.current;
    if (t !== 'draw' && t !== 'eraser') return;
    e.stopPropagation();

    isDrawing.current = true;

    if (t === 'eraser') {
      eraseAtPos(getPos(e));
      return;
    }

    currentPoints.current = [getPos(e)];
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing.current) return;
    const t = toolRef.current;

    if (t === 'eraser') {
      eraseAtPos(getPos(e));
      return;
    }

    if (t !== 'draw') return;
    currentPoints.current.push(getPos(e));
    redraw();
  }, [redraw]);

  const handleMouseUp = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;

    if (toolRef.current === 'draw' && currentPoints.current.length >= 2) {
      onAddStrokeRef.current({
        id: `stroke-${++strokeIdCounter}`,
        points: [...currentPoints.current],
        color: currentColorRef.current,
        width: currentWidthRef.current,
      });
    }
    currentPoints.current = [];
  }, []);

  const isActive = tool === 'draw' || tool === 'eraser';

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      style={{
        zIndex: isActive ? 10 : 2,
        pointerEvents: isActive ? 'auto' : 'none',
        cursor: tool === 'draw' ? 'crosshair' : tool === 'eraser' ? 'pointer' : 'default',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
}