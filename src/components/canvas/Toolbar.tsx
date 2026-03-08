import { MousePointer2, Link, Plus, Trash2, Group, Ungroup, Image, Upload, SplitSquareVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CanvasTool, CanvasBackground } from '@/types/canvas';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRef } from 'react';

interface ToolbarProps {
  tool: CanvasTool;
  setTool: (t: CanvasTool) => void;
  background: CanvasBackground;
  setBackground: (b: CanvasBackground) => void;
  hasSelection: boolean;
  multiSelected: boolean;
  onDelete: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onBackgroundImageUpload: (file: File) => void;
}

const tools: { id: CanvasTool; icon: typeof MousePointer2; label: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select' },
  { id: 'connect', icon: Link, label: 'Connect' },
  { id: 'add', icon: Plus, label: 'Add Block' },
];

const backgrounds: { id: CanvasBackground; label: string }[] = [
  { id: 'grid', label: 'Grid' },
  { id: 'dots', label: 'Dots' },
  { id: 'blueprint', label: 'Blueprint' },
  { id: 'plain', label: 'Plain' },
];

export default function Toolbar({
  tool, setTool, background, setBackground,
  hasSelection, multiSelected, onDelete, onGroup, onUngroup,
  onBackgroundImageUpload,
}: ToolbarProps) {
  const bgFileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-3 py-2 bg-toolbar border border-toolbar-border rounded-xl shadow-lg">
      {tools.map(t => (
        <Button
          key={t.id}
          variant={tool === t.id ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setTool(t.id)}
          title={t.label}
          className="h-9 w-9 p-0"
        >
          <t.icon className="h-4 w-4" />
        </Button>
      ))}

      <div className="w-px h-6 bg-border mx-1" />

      {hasSelection && (
        <Button variant="ghost" size="sm" onClick={onDelete} title="Delete" className="h-9 w-9 p-0 text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
      {multiSelected && (
        <Button variant="ghost" size="sm" onClick={onGroup} title="Group" className="h-9 w-9 p-0">
          <Group className="h-4 w-4" />
        </Button>
      )}
      {hasSelection && (
        <Button variant="ghost" size="sm" onClick={onUngroup} title="Ungroup" className="h-9 w-9 p-0">
          <Ungroup className="h-4 w-4" />
        </Button>
      )}

      <div className="w-px h-6 bg-border mx-1" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" title="Background" className="h-9 w-9 p-0">
            <Image className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {backgrounds.map(bg => (
            <DropdownMenuItem
              key={bg.id}
              onClick={() => setBackground(bg.id)}
              className={background === bg.id ? 'bg-accent' : ''}
            >
              {bg.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={() => bgFileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" /> Upload Image
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={bgFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onBackgroundImageUpload(file);
        }}
      />
    </div>
  );
}
