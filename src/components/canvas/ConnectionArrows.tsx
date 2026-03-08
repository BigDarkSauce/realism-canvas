import { useState, useCallback, useEffect } from 'react';
import { Connection, Block, CanvasTool, ArrowStyle } from '@/types/canvas';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Palette, Minus } from 'lucide-react';

interface ConnectionArrowsProps {
  connections: Connection[];
  blocks: Block[];
  tool: CanvasTool;
  zoom: number;
  onDelete: (id: string) => void;
  onUpdateConnection: (id: string, updates: Partial<Connection>) => void;
}

const ARROW_COLORS = [
  '#6b7280', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#000000', '#ffffff',
];

const ARROW_STYLES: { value: ArrowStyle; label: string; preview: string }[] = [
  { value: 'solid', label: 'Solid', preview: '———' },
  { value: 'dashed', label: 'Dashed', preview: '- - -' },
  { value: 'dotted', label: 'Dotted', preview: '· · ·' },
];

function getCenter(block: Block) {
  return { x: block.x + block.width / 2, y: block.y + block.height / 2 };
}

function getEdgePoint(from: { x: number; y: number }, to: { x: number; y: number }, block: Block) {
  const cx = block.x + block.width / 2;
  const cy = block.y + block.height / 2;
  const hw = block.width / 2;
  const hh = block.height / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = Math.atan2(dy, dx);
  const absCos = Math.abs(Math.cos(angle));
  const absSin = Math.abs(Math.sin(angle));
  let px: number, py: number;
  if (hw * absSin < hh * absCos) {
    const sign = Math.cos(angle) > 0 ? 1 : -1;
    px = cx + sign * hw;
    py = cy + sign * hw * Math.tan(angle);
  } else {
    const sign = Math.sin(angle) > 0 ? 1 : -1;
    px = cx + sign * hh / Math.tan(angle);
    py = cy + sign * hh;
  }
  return { x: px, y: py };
}

function getDashArray(style?: ArrowStyle): string | undefined {
  if (style === 'dashed') return '8 4';
  if (style === 'dotted') return '2 4';
  return undefined;
}

function ArrowStylePopover({
  conn,
  position,
  onUpdate,
  onDelete,
}: {
  conn: Connection;
  position: { x: number; y: number };
  onUpdate: (updates: Partial<Connection>) => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="absolute z-[60]"
      style={{ left: position.x, top: position.y, transform: 'translate(-50%, -100%) translateY(-12px)' }}
    >
      <div
        className="bg-card border border-border rounded-lg shadow-xl p-3 space-y-3 w-[220px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Color */}
        <div>
          <p className="text-[10px] font-medium text-muted-foreground mb-1">Color</p>
          <div className="flex flex-wrap gap-1">
            {ARROW_COLORS.map((c) => (
              <button
                key={c}
                className={`h-5 w-5 rounded border transition-transform hover:scale-110 ${conn.color === c ? 'ring-2 ring-primary ring-offset-1' : 'border-border'}`}
                style={{ backgroundColor: c }}
                onClick={() => onUpdate({ color: c })}
              />
            ))}
            <input
              type="color"
              className="h-5 w-8 cursor-pointer border-0"
              value={conn.color || '#6b7280'}
              onChange={(e) => onUpdate({ color: e.target.value })}
            />
          </div>
        </div>

        {/* Thickness */}
        <div>
          <p className="text-[10px] font-medium text-muted-foreground mb-1">
            Thickness: {conn.strokeWidth || 2}px
          </p>
          <Slider
            value={[conn.strokeWidth || 2]}
            onValueChange={([v]) => onUpdate({ strokeWidth: v })}
            min={1}
            max={8}
            step={1}
            className="w-full"
          />
        </div>

        {/* Style */}
        <div>
          <p className="text-[10px] font-medium text-muted-foreground mb-1">Style</p>
          <div className="flex gap-1">
            {ARROW_STYLES.map((s) => (
              <button
                key={s.value}
                className={`flex-1 h-7 rounded border text-xs font-mono transition-colors ${(conn.arrowStyle || 'solid') === s.value
                  ? 'bg-primary/20 border-primary text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                onClick={() => onUpdate({ arrowStyle: s.value })}
              >
                {s.preview}
              </button>
            ))}
          </div>
        </div>

        {/* Delete */}
        <Button
          variant="destructive"
          size="sm"
          className="w-full h-7 text-xs"
          onClick={onDelete}
        >
          Delete Arrow
        </Button>
      </div>
    </div>
  );
}

export default function ConnectionArrows({ connections, blocks, tool, zoom, onDelete, onUpdateConnection }: ConnectionArrowsProps) {
  const blockMap = new Map(blocks.map(b => [b.id, b]));
  const [draggingCp, setDraggingCp] = useState<string | null>(null);
  const [selectedConn, setSelectedConn] = useState<string | null>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!selectedConn) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-arrow-popover]')) return;
      setSelectedConn(null);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [selectedConn]);

  const handleCpMouseDown = useCallback((e: React.MouseEvent, connId: string) => {
    if (tool !== 'select') return;
    e.stopPropagation();
    setDraggingCp(connId);

    const handleMove = (ev: MouseEvent) => {
      const svg = (e.target as SVGElement).closest('svg');
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const conn = connections.find(c => c.id === connId);
      if (!conn) return;
      const fromBlock = blockMap.get(conn.fromId);
      const toBlock = blockMap.get(conn.toId);
      if (!fromBlock || !toBlock) return;
      const canvasX = (ev.clientX - rect.left) / zoom;
      const canvasY = (ev.clientY - rect.top) / zoom;
      const midX = (getCenter(fromBlock).x + getCenter(toBlock).x) / 2;
      const midY = (getCenter(fromBlock).y + getCenter(toBlock).y) / 2;
      onUpdateConnection(connId, { cpX: canvasX - midX, cpY: canvasY - midY });
    };

    const handleUp = () => {
      setDraggingCp(null);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [tool, connections, blockMap, onUpdateConnection]);

  const handleArrowClick = useCallback((connId: string) => {
    if (tool !== 'select') return;
    setSelectedConn((prev) => (prev === connId ? null : connId));
  }, [tool]);

  // Generate unique marker IDs per connection style
  const getMarkerId = (conn: Connection) => {
    const color = (conn.color || '#6b7280').replace('#', '');
    return `arrowhead-${color}`;
  };

  // Collect unique marker defs
  const markerColors = new Set(connections.map(c => c.color || '#6b7280'));

  return (
    <>
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 5 }}>
        <defs>
          {[...markerColors].map((color) => (
            <marker
              key={color}
              id={`arrowhead-${color.replace('#', '')}`}
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill={color} />
            </marker>
          ))}
          {/* Fallback */}
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" className="fill-connection" />
          </marker>
        </defs>
        {connections.map(conn => {
          const fromBlock = blockMap.get(conn.fromId);
          const toBlock = blockMap.get(conn.toId);
          if (!fromBlock || !toBlock) return null;

          const fromCenter = getCenter(fromBlock);
          const toCenter = getCenter(toBlock);
          const midX = (fromCenter.x + toCenter.x) / 2 + (conn.cpX || 0);
          const midY = (fromCenter.y + toCenter.y) / 2 + (conn.cpY || 0);
          const start = getEdgePoint(fromCenter, { x: midX, y: midY }, fromBlock);
          const end = getEdgePoint(toCenter, { x: midX, y: midY }, toBlock);
          const hasBend = conn.cpX !== undefined && conn.cpY !== undefined && (Math.abs(conn.cpX) > 2 || Math.abs(conn.cpY) > 2);
          const pathD = hasBend
            ? `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`
            : `M ${start.x} ${start.y} L ${end.x} ${end.y}`;

          const strokeColor = conn.color || undefined;
          const strokeW = conn.strokeWidth || 2;
          const dashArray = getDashArray(conn.arrowStyle);
          const markerId = conn.color ? getMarkerId(conn) : 'arrowhead';

          return (
            <g key={conn.id}>
              <path
                d={pathD}
                stroke={strokeColor}
                className={strokeColor ? undefined : 'stroke-connection'}
                strokeWidth={strokeW}
                fill="none"
                strokeDasharray={dashArray}
                markerEnd={`url(#${markerId})`}
              />
              {/* Click target */}
              <path
                d={pathD}
                stroke="transparent"
                strokeWidth={Math.max(12, strokeW + 8)}
                fill="none"
                className="pointer-events-auto cursor-pointer"
                onClick={() => handleArrowClick(conn.id)}
              />
              {/* Control point handle */}
              {tool === 'select' && (
                <circle
                  cx={midX}
                  cy={midY}
                  r={5}
                  className="fill-primary/40 stroke-primary pointer-events-auto cursor-grab"
                  strokeWidth={1.5}
                  onMouseDown={(e) => handleCpMouseDown(e, conn.id)}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Style popover for selected connection */}
      {selectedConn && (() => {
        const conn = connections.find(c => c.id === selectedConn);
        if (!conn) return null;
        const fromBlock = blockMap.get(conn.fromId);
        const toBlock = blockMap.get(conn.toId);
        if (!fromBlock || !toBlock) return null;
        const fromCenter = getCenter(fromBlock);
        const toCenter = getCenter(toBlock);
        const mx = (fromCenter.x + toCenter.x) / 2 + (conn.cpX || 0);
        const my = (fromCenter.y + toCenter.y) / 2 + (conn.cpY || 0);
        return (
          <ArrowStylePopover
            conn={conn}
            position={{ x: mx, y: my }}
            onUpdate={(updates) => onUpdateConnection(conn.id, updates)}
            onDelete={() => { onDelete(conn.id); setSelectedConn(null); }}
          />
        );
      })()}
    </>
  );
}
