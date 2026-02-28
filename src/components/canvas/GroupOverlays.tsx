import { Group, Block } from '@/types/canvas';

interface GroupOverlaysProps {
  groups: Group[];
  blocks: Block[];
}

export default function GroupOverlays({ groups, blocks }: GroupOverlaysProps) {
  return (
    <>
      {groups.map(group => {
        const groupBlocks = blocks.filter(b => b.groupId === group.id);
        if (groupBlocks.length === 0) return null;

        const minX = Math.min(...groupBlocks.map(b => b.x)) - 12;
        const minY = Math.min(...groupBlocks.map(b => b.y)) - 28;
        const maxX = Math.max(...groupBlocks.map(b => b.x + b.width)) + 12;
        const maxY = Math.max(...groupBlocks.map(b => b.y + b.height)) + 12;

        return (
          <div
            key={group.id}
            className="absolute rounded-xl border-2 border-dashed border-group-border bg-group/30 pointer-events-none"
            style={{
              left: minX,
              top: minY,
              width: maxX - minX,
              height: maxY - minY,
              zIndex: 1,
            }}
          >
            <span className="absolute -top-0 left-3 px-2 bg-group text-xs font-mono font-semibold text-primary rounded-b">
              {group.label}
            </span>
          </div>
        );
      })}
    </>
  );
}
