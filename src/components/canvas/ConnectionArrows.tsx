import { Connection, Block } from '@/types/canvas';

interface ConnectionArrowsProps {
  connections: Connection[];
  blocks: Block[];
  onDelete: (id: string) => void;
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

  // Check intersection with edges
  const absCos = Math.abs(Math.cos(angle));
  const absSin = Math.abs(Math.sin(angle));

  let px: number, py: number;
  if (hw * absSin < hh * absCos) {
    // Hits left or right
    const sign = Math.cos(angle) > 0 ? 1 : -1;
    px = cx + sign * hw;
    py = cy + sign * hw * Math.tan(angle);
  } else {
    // Hits top or bottom
    const sign = Math.sin(angle) > 0 ? 1 : -1;
    px = cx + sign * hh / Math.tan(angle);
    py = cy + sign * hh;
  }

  return { x: px, y: py };
}

export default function ConnectionArrows({ connections, blocks, onDelete }: ConnectionArrowsProps) {
  const blockMap = new Map(blocks.map(b => [b.id, b]));

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
        const start = getEdgePoint(fromCenter, toCenter, fromBlock);
        const end = getEdgePoint(toCenter, fromCenter, toBlock);

        return (
          <g key={conn.id}>
            <line
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              className="stroke-connection"
              strokeWidth={2}
              markerEnd="url(#arrowhead)"
            />
            {/* Invisible fat line for click target */}
            <line
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke="transparent"
              strokeWidth={12}
              className="pointer-events-auto cursor-pointer"
              onClick={() => onDelete(conn.id)}
            />
          </g>
        );
      })}
    </svg>
  );
}
