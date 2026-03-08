import { useState, useCallback } from 'react';
import { Connection, Block, CanvasTool } from '@/types/canvas';

interface ConnectionArrowsProps {
  connections: Connection[];
  blocks: Block[];
  tool: CanvasTool;
  zoom: number;
  pan: { x: number; y: number };
  onDelete: (id: string) => void;
  onUpdateConnection: (id: string, updates: Partial<Connection>) => void;
}

function getCenter(block: Block) {
  return {
    x: block.x + block.width / 2,
    y: block.y + block.height / 2,
  };
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

export default function ConnectionArrows({ connections, blocks, tool, zoom, pan, onDelete, onUpdateConnection }: ConnectionArrowsProps) {
  const blockMap = new Map(blocks.map(b => [b.id, b]));
  const [draggingCp, setDraggingCp] = useState<string | null>(null);

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
      const midX = (getCenter(fromBlock).x + getCenter(toBlock).x) / 2;
      const midY = (getCenter(fromBlock).y + getCenter(toBlock).y) / 2;
      onUpdateConnection(connId, {
        cpX: ev.clientX - rect.left - midX,
        cpY: ev.clientY - rect.top - midY,
      });
    };

    const handleUp = () => {
      setDraggingCp(null);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [tool, connections, blockMap, onUpdateConnection]);

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 5 }}>
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            className="fill-connection"
          />
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

        // For edge points, aim at control point
        const start = getEdgePoint(fromCenter, { x: midX, y: midY }, fromBlock);
        const end = getEdgePoint(toCenter, { x: midX, y: midY }, toBlock);

        const hasBend = conn.cpX !== undefined && conn.cpY !== undefined && (Math.abs(conn.cpX) > 2 || Math.abs(conn.cpY) > 2);
        const pathD = hasBend
          ? `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`
          : `M ${start.x} ${start.y} L ${end.x} ${end.y}`;

        return (
          <g key={conn.id}>
            <path
              d={pathD}
              className="stroke-connection"
              strokeWidth={2}
              fill="none"
              markerEnd="url(#arrowhead)"
            />
            {/* Fat invisible click target */}
            <path
              d={pathD}
              stroke="transparent"
              strokeWidth={12}
              fill="none"
              className="pointer-events-auto cursor-pointer"
              onClick={() => onDelete(conn.id)}
            />
            {/* Draggable control point handle */}
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
  );
}
