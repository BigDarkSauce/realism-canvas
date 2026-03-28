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
  // Include block extents in the effective canvas size so minimap covers all content
  const effectiveSize = useMemo(() => {
    let maxX = canvasSize.width;
    let maxY = canvasSize.height;
    for (const b of blocks) {
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    return { width: maxX, height: maxY };
  }, [blocks, canvasSize]);

  const scale = useMemo(() => Math.min(MINIMAP_W / effectiveSize.width, MINIMAP_H / effectiveSize.height), [effectiveSize]);

  const viewport = useMemo(() => {
    const rawX = (-pan.x / zoom) * scale;
    const rawY = (-pan.y / zoom) * scale;
    const rawW = (viewportWidth / zoom) * scale;
    const rawH = (viewportHeight / zoom) * scale;
    // Clamp viewport rect to minimap bounds
    return {
      x: Math.max(0, rawX),
      y: Math.max(0, rawY),
      w: Math.min(rawW, MINIMAP_W - Math.max(0, rawX)),
      h: Math.min(rawH, MINIMAP_H - Math.max(0, rawY)),
    };
  }, [pan, zoom, scale, viewportWidth, viewportHeight]);

  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const canvasX = mx / scale;
    const canvasY = my / scale;
    // Clamp so we don't navigate past canvas bounds
    const clampedX = Math.max(0, Math.min(canvasX, effectiveSize.width));
    const clampedY = Math.max(0, Math.min(canvasY, effectiveSize.height));
    onNavigate({
      x: -(clampedX - viewportWidth / zoom / 2) * zoom,
      y: -(clampedY - viewportHeight / zoom / 2) * zoom,
    });
  }, [scale, zoom, viewportWidth, viewportHeight, onNavigate, effectiveSize]);

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
