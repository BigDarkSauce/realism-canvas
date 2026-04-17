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

function distancePointToSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  const projectionX = start.x + t * dx;
  const projectionY = start.y + t * dy;
  return Math.hypot(point.x - projectionX, point.y - projectionY);
}

function orientation(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function onSegment(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
  return (
    b.x <= Math.max(a.x, c.x) &&
    b.x >= Math.min(a.x, c.x) &&
    b.y <= Math.max(a.y, c.y) &&
    b.y >= Math.min(a.y, c.y)
  );
}

function segmentsIntersect(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number }
) {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  if (o1 === 0 && onSegment(a1, b1, a2)) return true;
  if (o2 === 0 && onSegment(a1, b2, a2)) return true;
  if (o3 === 0 && onSegment(b1, a1, b2)) return true;
  if (o4 === 0 && onSegment(b1, a2, b2)) return true;
  return false;
}

function distanceBetweenSegments(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number }
) {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0;

  return Math.min(
    distancePointToSegment(a1, b1, b2),
    distancePointToSegment(a2, b1, b2),
    distancePointToSegment(b1, a1, a2),
    distancePointToSegment(b2, a1, a2)
  );
}

function strokeIntersectsBrushPath(
  stroke: DrawingStroke,
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number
) {
  if (stroke.points.length === 0) return false;
  if (stroke.points.length === 1) return distancePointToSegment(stroke.points[0], from, to) <= radius;

  for (let i = 1; i < stroke.points.length; i++) {
    if (distanceBetweenSegments(from, to, stroke.points[i - 1], stroke.points[i]) <= radius) {
      return true;
    }
  }

  return false;
}

export default function DrawingCanvas({ strokes, currentColor, currentWidth, tool, onAddStroke, onEraseStroke }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const currentPoints = useRef<{ x: number; y: number }[]>([]);
  const lastPointerPos = useRef<{ x: number; y: number } | null>(null);
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

  const getPos = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const eraseAlongPath = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const radius = Math.max(12, currentWidthRef.current * 2.5);
    const erasedIds = new Set<string>();

    for (const stroke of strokesRef.current) {
      if (erasedIds.has(stroke.id)) continue;

      if (strokeIntersectsBrushPath(stroke, from, to, radius)) {
        erasedIds.add(stroke.id);
        onEraseStrokeRef.current(stroke.id);
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

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const t = toolRef.current;
    if (t !== 'draw' && t !== 'eraser') return;
    e.stopPropagation();
    e.preventDefault();

    isDrawing.current = true;
    const pos = getPos(e.clientX, e.clientY);
    lastPointerPos.current = pos;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore capture failures.
    }

    if (t === 'eraser') {
      eraseAlongPath(pos, pos);
      return;
    }

    currentPoints.current = [pos];
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const t = toolRef.current;
    const pos = getPos(e.clientX, e.clientY);

    if (t === 'eraser') {
      const from = lastPointerPos.current ?? pos;
      eraseAlongPath(from, pos);
      lastPointerPos.current = pos;
      return;
    }

    if (t !== 'draw') return;
    currentPoints.current.push(pos);
    lastPointerPos.current = pos;
    redraw();
  }, [redraw]);

  const handlePointerUp = useCallback((e?: React.PointerEvent<HTMLCanvasElement>) => {
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

    if (e) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore release failures.
      }
    }

    currentPoints.current = [];
    lastPointerPos.current = null;
    redraw();
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
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
}