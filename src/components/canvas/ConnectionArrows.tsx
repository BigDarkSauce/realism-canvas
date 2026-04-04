import { useState, useCallback, useEffect } from 'react';
import { Connection, Block, CanvasTool, ArrowStyle, ConnectionControlPoint } from '@/types/canvas';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Plus, Minus } from 'lucide-react';

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

/** Get all control points for a connection, converting legacy cpX/cpY */
function getControlPoints(conn: Connection, fromBlock: Block, toBlock: Block): ConnectionControlPoint[] {
  if (conn.controlPoints && conn.controlPoints.length > 0) {
    return conn.controlPoints;
  }
  // Legacy single cp
  if (conn.cpX !== undefined && conn.cpY !== undefined && (Math.abs(conn.cpX) > 2 || Math.abs(conn.cpY) > 2)) {
    const fromCenter = getCenter(fromBlock);
    const toCenter = getCenter(toBlock);
    const midX = (fromCenter.x + toCenter.x) / 2 + conn.cpX;
    const midY = (fromCenter.y + toCenter.y) / 2 + conn.cpY;
    return [{ x: midX, y: midY }];
  }
  return [];
}

/** Build an SVG path through start, control points, and end using quadratic segments */
function buildPath(start: { x: number; y: number }, end: { x: number; y: number }, cps: ConnectionControlPoint[]): string {
  if (cps.length === 0) {
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  }
  if (cps.length === 1) {
    return `M ${start.x} ${start.y} Q ${cps[0].x} ${cps[0].y} ${end.x} ${end.y}`;
  }
  // Multiple CPs: use a series of quadratic curves through intermediate points
  let d = `M ${start.x} ${start.y}`;
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i];
    const nextPt = i < cps.length - 1
      ? { x: (cps[i].x + cps[i + 1].x) / 2, y: (cps[i].y + cps[i + 1].y) / 2 }
      : end;
    d += ` Q ${cp.x} ${cp.y} ${nextPt.x} ${nextPt.y}`;
  }
  return d;
}

function ArrowStylePopover({
  conn,
  position,
  onUpdate,
  onDelete,
  onAddNode,
  onRemoveNode,
  nodeCount,
}: {
  conn: Connection;
  position: { x: number; y: number };
  onUpdate: (updates: Partial<Connection>) => void;
  onDelete: () => void;
  onAddNode: () => void;
  onRemoveNode: () => void;
  nodeCount: number;
}) {
  return (
    <div
      className="absolute z-[60]"
      style={{ left: position.x, top: position.y, transform: 'translate(-50%, -100%) translateY(-12px)' }}
    >
      <div
        data-arrow-popover
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

        {/* Add/Remove bend node */}
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-7 text-xs gap-1"
            onClick={onAddNode}
          >
            <Plus className="h-3 w-3" /> Add Node
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-7 text-xs gap-1"
            onClick={onRemoveNode}
            disabled={nodeCount === 0}
          >
            <Minus className="h-3 w-3" /> Remove Node
          </Button>
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
  const [draggingCp, setDraggingCp] = useState<{ connId: string; cpIndex: number } | null>(null);
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

  const handleCpMouseDown = useCallback((e: React.MouseEvent, connId: string, cpIndex: number) => {
    if (tool !== 'select') return;
    e.stopPropagation();
    setDraggingCp({ connId, cpIndex });

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

      const cps = getControlPoints(conn, fromBlock, toBlock);
      const newCps = [...cps];
      newCps[cpIndex] = { x: canvasX, y: canvasY };
      onUpdateConnection(connId, { controlPoints: newCps, cpX: undefined, cpY: undefined });
    };

    const handleUp = () => {
      setDraggingCp(null);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [tool, connections, blockMap, onUpdateConnection, zoom]);

  const handleCpDoubleClick = useCallback((e: React.MouseEvent, connId: string, cpIndex: number) => {
    e.stopPropagation();
    const conn = connections.find(c => c.id === connId);
    if (!conn) return;
    const fromBlock = blockMap.get(conn.fromId);
    const toBlock = blockMap.get(conn.toId);
    if (!fromBlock || !toBlock) return;
    const cps = getControlPoints(conn, fromBlock, toBlock);
    if (cps.length <= 1) return; // don't remove if only 1 cp
    const newCps = cps.filter((_, i) => i !== cpIndex);
    onUpdateConnection(connId, { controlPoints: newCps, cpX: undefined, cpY: undefined });
  }, [connections, blockMap, onUpdateConnection]);

  const handleAddNode = useCallback((connId: string) => {
    const conn = connections.find(c => c.id === connId);
    if (!conn) return;
    const fromBlock = blockMap.get(conn.fromId);
    const toBlock = blockMap.get(conn.toId);
    if (!fromBlock || !toBlock) return;
    const cps = getControlPoints(conn, fromBlock, toBlock);
    const fromCenter = getCenter(fromBlock);
    const toCenter = getCenter(toBlock);

    let newPt: ConnectionControlPoint;
    if (cps.length === 0) {
      newPt = { x: (fromCenter.x + toCenter.x) / 2, y: (fromCenter.y + toCenter.y) / 2 - 40 };
    } else {
      const lastCp = cps[cps.length - 1];
      newPt = { x: (lastCp.x + toCenter.x) / 2, y: (lastCp.y + toCenter.y) / 2 };
    }
    onUpdateConnection(connId, { controlPoints: [...cps, newPt], cpX: undefined, cpY: undefined });
  }, [connections, blockMap, onUpdateConnection]);

  const handleRemoveNode = useCallback((connId: string) => {
    const conn = connections.find(c => c.id === connId);
    if (!conn) return;
    const fromBlock = blockMap.get(conn.fromId);
    const toBlock = blockMap.get(conn.toId);
    if (!fromBlock || !toBlock) return;
    const cps = getControlPoints(conn, fromBlock, toBlock);
    if (cps.length === 0) return;
    const newCps = cps.slice(0, -1);
    onUpdateConnection(connId, { controlPoints: newCps, cpX: undefined, cpY: undefined });
  }, [connections, blockMap, onUpdateConnection]);

  const handleArrowClick = useCallback((connId: string) => {
    if (tool !== 'select') return;
    setSelectedConn((prev) => (prev === connId ? null : connId));
  }, [tool]);

  // Generate unique marker IDs per connection style
  const getMarkerId = (conn: Connection) => {
    const color = (conn.color || '#6b7280').replace('#', '');
    const sw = conn.strokeWidth || 2;
    return `arrowhead-${color}-${sw}`;
  };

  // Collect unique marker defs keyed by color+size
  const markerKeys = new Set(connections.map(c => {
    const color = c.color || '#6b7280';
    const sw = c.strokeWidth || 2;
    return `${color}|${sw}`;
  }));

  return (
    <>
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 5 }}>
        <defs>
          {[...markerKeys].map((key) => {
            const [color, swStr] = key.split('|');
            const sw = parseFloat(swStr);
            const markerSize = Math.max(8, 6 + sw);
            const id = `arrowhead-${color.replace('#', '')}-${sw}`;
            return (
              <marker
                key={id}
                id={id}
                markerWidth={markerSize}
                markerHeight={markerSize * 0.7}
                refX={markerSize - 1}
                refY={markerSize * 0.35}
                orient="auto"
              >
                <polygon points={`0 0, ${markerSize} ${markerSize * 0.35}, 0 ${markerSize * 0.7}`} fill={color} />
              </marker>
            );
          })}
        </defs>
        {connections.map(conn => {
          const fromBlock = blockMap.get(conn.fromId);
          const toBlock = blockMap.get(conn.toId);
          if (!fromBlock || !toBlock) return null;

          const fromCenter = getCenter(fromBlock);
          const toCenter = getCenter(toBlock);
          const cps = getControlPoints(conn, fromBlock, toBlock);

          // Compute edge points: aim at first CP or toCenter, and last CP or fromCenter
          const firstAim = cps.length > 0 ? cps[0] : toCenter;
          const lastAim = cps.length > 0 ? cps[cps.length - 1] : fromCenter;
          const start = getEdgePoint(fromCenter, firstAim, fromBlock);
          const rawEnd = getEdgePoint(toCenter, lastAim, toBlock);

          // Pull back the endpoint so the arrowhead tip sits at the block edge
          const markerSize = Math.max(8, 6 + (conn.strokeWidth || 2));
          const pullbackSource = cps.length > 0 ? cps[cps.length - 1] : start;
          const edgeAngle = Math.atan2(rawEnd.y - pullbackSource.y, rawEnd.x - pullbackSource.x);
          const end = {
            x: rawEnd.x - Math.cos(edgeAngle) * (markerSize - 1),
            y: rawEnd.y - Math.sin(edgeAngle) * (markerSize - 1),
          };

          const pathD = buildPath(start, end, cps);
          const strokeColor = conn.color || undefined;
          const strokeW = conn.strokeWidth || 2;
          const dashArray = getDashArray(conn.arrowStyle);
          const markerId = getMarkerId(conn);

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
              {/* Control point handles */}
              {tool === 'select' && cps.map((cp, i) => (
                <circle
                  key={i}
                  cx={cp.x}
                  cy={cp.y}
                  r={5}
                  className="fill-primary/40 stroke-primary pointer-events-auto cursor-grab"
                  strokeWidth={1.5}
                  onMouseDown={(e) => handleCpMouseDown(e, conn.id, i)}
                  onDoubleClick={(e) => handleCpDoubleClick(e, conn.id, i)}
                />
              ))}
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
        const cps = getControlPoints(conn, fromBlock, toBlock);
        const mx = cps.length > 0
          ? cps[Math.floor(cps.length / 2)].x
          : (fromCenter.x + toCenter.x) / 2;
        const my = cps.length > 0
          ? cps[Math.floor(cps.length / 2)].y
          : (fromCenter.y + toCenter.y) / 2;
        return (
          <ArrowStylePopover
            conn={conn}
            position={{ x: mx, y: my }}
            onUpdate={(updates) => onUpdateConnection(conn.id, updates)}
            onDelete={() => { onDelete(conn.id); setSelectedConn(null); }}
            onAddNode={() => handleAddNode(conn.id)}
            onRemoveNode={() => handleRemoveNode(conn.id)}
            nodeCount={cps.length}
          />
        );
      })()}
    </>
  );
}

export { getCenter, getEdgePoint, getControlPoints, buildPath };
