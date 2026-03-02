import { useState } from 'react';
import { Group, Block } from '@/types/canvas';
import { Input } from '@/components/ui/input';

interface GroupOverlaysProps {
  groups: Group[];
  blocks: Block[];
  onRenameGroup: (groupId: string, newLabel: string) => void;
}

export default function GroupOverlays({ groups, blocks, onRenameGroup }: GroupOverlaysProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

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
            {editingId === group.id ? (
              <Input
                autoFocus
                value={editLabel}
                onChange={e => setEditLabel(e.target.value)}
                onBlur={() => {
                  onRenameGroup(group.id, editLabel || 'Group');
                  setEditingId(null);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    onRenameGroup(group.id, editLabel || 'Group');
                    setEditingId(null);
                  }
                }}
                className="absolute -top-0 left-3 w-32 h-5 text-xs font-mono font-semibold px-2 py-0 pointer-events-auto bg-group border-group-border"
              />
            ) : (
              <span
                className="absolute -top-0 left-3 px-2 bg-group text-xs font-mono font-semibold text-primary rounded-b cursor-pointer pointer-events-auto hover:underline"
                onDoubleClick={() => {
                  setEditLabel(group.label);
                  setEditingId(group.id);
                }}
                title="Double-click to rename"
              >
                {group.label}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}
