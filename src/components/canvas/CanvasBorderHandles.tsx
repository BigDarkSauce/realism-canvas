import { cn } from '@/lib/utils';

interface CanvasBorderHandlesProps {
  canvasSize: { width: number; height: number };
  onExtend: (direction: 'top' | 'bottom' | 'left' | 'right') => void;
  pan: { x: number; y: number };
  zoom: number;
}

const EXTEND_AMOUNT = 400;

export default function CanvasBorderHandles({ canvasSize, onExtend, pan, zoom }: CanvasBorderHandlesProps) {
  const handleClass = "absolute flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200 z-30 group";
  const btnClass = "bg-primary/80 hover:bg-primary text-primary-foreground text-xs font-mono px-2 py-1 rounded shadow-md cursor-pointer select-none";

  // Calculate where the canvas edges are in screen space
  const left = pan.x;
  const top = pan.y;
  const right = pan.x + canvasSize.width * zoom;
  const bottom = pan.y + canvasSize.height * zoom;

  return (
    <>
      {/* Top */}
      <div
        className={cn(handleClass)}
        style={{ left: Math.max(left, 0), right: `calc(100% - ${Math.min(right, window.innerWidth)}px)`, top: Math.max(top - 16, 0), height: 32 }}
      >
        <button className={btnClass} onClick={() => onExtend('top')}>+ Extend top</button>
      </div>
      {/* Bottom */}
      <div
        className={cn(handleClass)}
        style={{ left: Math.max(left, 0), right: `calc(100% - ${Math.min(right, window.innerWidth)}px)`, top: Math.min(bottom - 16, window.innerHeight - 32), height: 32 }}
      >
        <button className={btnClass} onClick={() => onExtend('bottom')}>+ Extend bottom</button>
      </div>
      {/* Left */}
      <div
        className={cn(handleClass, "flex-col")}
        style={{ top: Math.max(top, 0), bottom: `calc(100% - ${Math.min(bottom, window.innerHeight)}px)`, left: Math.max(left - 16, 0), width: 32 }}
      >
        <button className={cn(btnClass, "writing-mode-vertical")} style={{ writingMode: 'vertical-lr' }} onClick={() => onExtend('left')}>+ Extend</button>
      </div>
      {/* Right */}
      <div
        className={cn(handleClass, "flex-col")}
        style={{ top: Math.max(top, 0), bottom: `calc(100% - ${Math.min(bottom, window.innerHeight)}px)`, right: `calc(100% - ${Math.min(right + 16, window.innerWidth)}px)`, width: 32 }}
      >
        <button className={cn(btnClass, "writing-mode-vertical")} style={{ writingMode: 'vertical-lr' }} onClick={() => onExtend('right')}>+ Extend</button>
      </div>
    </>
  );
}

export { EXTEND_AMOUNT };
