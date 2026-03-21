import { useMemo, useCallback } from 'react';
import { Block } from '@/types/canvas';

interface MinimapProps {
  blocks: Block[];
  canvasSize: { width: number; height: number };
  pan: { x: number; y: number };
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  onNavigate: (pan: { x: number; y: number }) => void;
}

const MINIMAP_W = 180;
const MINIMAP_H = 120;

export default function Minimap({ blocks, canvasSize, pan, zoom, viewportWidth, viewportHeight, onNavigate }: MinimapProps) {
  const scale = useMemo(() => Math.min(MINIMAP_W / canvasSize.width, MINIMAP_H / canvasSize.height), [canvasSize]);

  const viewport = useMemo(() => ({
    x: (-pan.x / zoom) * scale,
    y: (-pan.y / zoom) * scale,
    w: (viewportWidth / zoom) * scale,
    h: (viewportHeight / zoom) * scale,
  }), [pan, zoom, scale, viewportWidth, viewportHeight]);

  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const canvasX = mx / scale;
    const canvasY = my / scale;
    onNavigate({
      x: -(canvasX - viewportWidth / zoom / 2) * zoom,
      y: -(canvasY - viewportHeight / zoom / 2) * zoom,
    });
  }, [scale, zoom, viewportWidth, viewportHeight, onNavigate]);

  return (
    <div className="absolute bottom-14 right-4 z-50 bg-card/90 backdrop-blur border border-border rounded-lg shadow-lg overflow-hidden">
      <svg width={MINIMAP_W} height={MINIMAP_H} onClick={handleClick} className="cursor-crosshair">
        <rect width={MINIMAP_W} height={MINIMAP_H} fill="hsl(var(--canvas-bg))" />
        {blocks.map(b => (
          <rect
            key={b.id}
            x={b.x * scale} y={b.y * scale}
            width={Math.max(b.width * scale, 2)} height={Math.max(b.height * scale, 2)}
            fill="hsl(var(--primary))" opacity={0.6} rx={1}
          />
        ))}
        <rect
          x={viewport.x} y={viewport.y}
          width={Math.max(viewport.w, 4)} height={Math.max(viewport.h, 4)}
          fill="none" stroke="hsl(var(--destructive))" strokeWidth={1.5} rx={1}
        />
      </svg>
    </div>
  );
}
