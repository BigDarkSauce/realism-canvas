import { useState } from 'react';
import { Group, Block } from '@/types/canvas';
import { Input } from '@/components/ui/input';
import { Paintbrush } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface GroupOverlaysProps {
  groups: Group[];
  blocks: Block[];
  onRenameGroup: (groupId: string, newLabel: string) => void;
  onUpdateGroup: (groupId: string, updates: Partial<Group>) => void;
}

const FONT_OPTIONS = [
  { value: 'JetBrains Mono, monospace', label: 'Mono' },
  { value: 'Inter, sans-serif', label: 'Inter' },
  { value: 'DM Sans, sans-serif', label: 'DM Sans' },
  { value: 'Crimson Pro, serif', label: 'Serif' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Arial, sans-serif', label: 'Arial' },
];

const BG_PRESETS = [
  'transparent',
  '#fef3c7', '#fce7f3', '#dbeafe', '#d1fae5',
  '#ede9fe', '#fee2e2', '#e0e7ff', '#f3f4f6',
  '#1e293b', '#0f172a', '#1a1a2e',
];

export default function GroupOverlays({ groups, blocks, onRenameGroup, onUpdateGroup }: GroupOverlaysProps) {
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

        const groupStyle: React.CSSProperties = {
          left: minX,
          top: minY,
          width: maxX - minX,
          height: maxY - minY,
          zIndex: 1,
          fontFamily: group.fontFamily || undefined,
          fontSize: group.fontSize || undefined,
          backgroundColor: group.bgColor && group.bgColor !== 'transparent'
            ? group.bgColor + '4D' // ~30% opacity
            : undefined,
          color: group.textColor || undefined,
        };

        return (
          <div
            key={group.id}
            className="absolute rounded-xl border-2 border-dashed border-group-border pointer-events-none"
            style={groupStyle}
          >
            <div className="absolute -top-0 left-3 flex items-center gap-1 pointer-events-auto">
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
                  className="w-32 h-5 text-xs font-semibold px-2 py-0 bg-card border-border"
                  style={{ fontFamily: group.fontFamily || undefined }}
                />
              ) : (
                <span
                  className="px-2 bg-card text-xs font-semibold text-primary rounded-b cursor-pointer hover:underline"
                  onDoubleClick={() => {
                    setEditLabel(group.label);
                    setEditingId(group.id);
                  }}
                  title="Double-click to rename"
                  style={{ fontFamily: group.fontFamily || undefined }}
                >
                  {group.label}
                </span>
              )}

              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent"
                    title="Group style"
                  >
                    <Paintbrush className="h-3 w-3 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 space-y-3" side="right">
                  <div className="space-y-1">
                    <Label className="text-xs">Font</Label>
                    <Select
                      value={group.fontFamily || 'JetBrains Mono, monospace'}
                      onValueChange={val => onUpdateGroup(group.id, { fontFamily: val })}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONT_OPTIONS.map(f => (
                          <SelectItem key={f.value} value={f.value}>
                            <span style={{ fontFamily: f.value }}>{f.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Background</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {BG_PRESETS.map(c => (
                        <button
                          key={c}
                          className={`h-6 w-6 rounded border border-border ${group.bgColor === c ? 'ring-2 ring-primary' : ''}`}
                          style={{ backgroundColor: c === 'transparent' ? 'transparent' : c }}
                          onClick={() => onUpdateGroup(group.id, { bgColor: c })}
                          title={c}
                        />
                      ))}
                    </div>
                    <Input
                      type="color"
                      value={group.bgColor && group.bgColor !== 'transparent' ? group.bgColor : '#ffffff'}
                      onChange={e => onUpdateGroup(group.id, { bgColor: e.target.value })}
                      className="h-7 w-full p-0.5 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Text Color</Label>
                    <Input
                      type="color"
                      value={group.textColor || '#000000'}
                      onChange={e => onUpdateGroup(group.id, { textColor: e.target.value })}
                      className="h-7 w-full p-0.5 cursor-pointer"
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        );
      })}
    </>
  );
}
