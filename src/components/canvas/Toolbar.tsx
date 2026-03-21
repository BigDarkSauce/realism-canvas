import { MousePointer2, Link, Plus, Trash2, Group, Ungroup, Image, Upload, SplitSquareVertical, Undo2, Redo2, Download, Brain, Keyboard, Map, Circle, Diamond, StickyNote, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CanvasTool, CanvasBackground, BlockShape } from '@/types/canvas';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
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
  onSplitDocument: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onExport: () => void;
  onAIAnalyze: () => void;
  onShortcuts: () => void;
  onToggleMinimap: () => void;
  showMinimap: boolean;
  onAddShape: (shape: BlockShape) => void;
}

const tools: { id: CanvasTool; icon: typeof MousePointer2; label: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select' },
  { id: 'connect', icon: Link, label: 'Connect' },
];

const backgrounds: { id: CanvasBackground; label: string }[] = [
  { id: 'grid', label: 'Grid' },
  { id: 'dots', label: 'Dots' },
  { id: 'blueprint', label: 'Blueprint' },
  { id: 'plain', label: 'Plain' },
];

const shapes: { id: BlockShape; icon: typeof Circle; label: string }[] = [
  { id: 'rectangle', icon: Plus, label: 'Rectangle' },
  { id: 'circle', icon: Circle, label: 'Circle' },
  { id: 'diamond', icon: Diamond, label: 'Diamond' },
  { id: 'sticky', icon: StickyNote, label: 'Sticky Note' },
  { id: 'text', icon: Type, label: 'Text Only' },
];

export default function Toolbar({
  tool, setTool, background, setBackground,
  hasSelection, multiSelected, onDelete, onGroup, onUngroup,
  onBackgroundImageUpload, onSplitDocument,
  onUndo, onRedo, canUndo, canRedo,
  onExport, onAIAnalyze, onShortcuts, onToggleMinimap, showMinimap,
  onAddShape,
}: ToolbarProps) {
  const bgFileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-3 py-2 bg-toolbar border border-toolbar-border rounded-xl shadow-lg">
      {/* Tools */}
      {tools.map(t => (
        <Button key={t.id} variant={tool === t.id ? 'default' : 'ghost'} size="sm" onClick={() => setTool(t.id)} title={t.label} className="h-9 w-9 p-0">
          <t.icon className="h-4 w-4" />
        </Button>
      ))}

      {/* Add Shape Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={tool === 'add' ? 'default' : 'ghost'} size="sm" title="Add Block" className="h-9 w-9 p-0">
            <Plus className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {shapes.map(s => (
            <DropdownMenuItem key={s.id} onClick={() => onAddShape(s.id)}>
              <s.icon className="h-4 w-4 mr-2" /> {s.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Undo/Redo */}
      <Button variant="ghost" size="sm" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" className="h-9 w-9 p-0">
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" className="h-9 w-9 p-0">
        <Redo2 className="h-4 w-4" />
      </Button>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Selection actions */}
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

      {/* Canvas actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" title="Background" className="h-9 w-9 p-0">
            <Image className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {backgrounds.map(bg => (
            <DropdownMenuItem key={bg.id} onClick={() => setBackground(bg.id)} className={background === bg.id ? 'bg-accent' : ''}>
              {bg.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={() => bgFileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" /> Upload Image
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="ghost" size="sm" onClick={onSplitDocument} title="Split Document" className="h-9 w-9 p-0">
        <SplitSquareVertical className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={onExport} title="Export" className="h-9 w-9 p-0">
        <Download className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={onAIAnalyze} title="AI Knowledge Graph" className="h-9 w-9 p-0">
        <Brain className="h-4 w-4" />
      </Button>
      <Button variant={showMinimap ? 'default' : 'ghost'} size="sm" onClick={onToggleMinimap} title="Toggle Minimap" className="h-9 w-9 p-0">
        <Map className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={onShortcuts} title="Keyboard Shortcuts (?)" className="h-9 w-9 p-0">
        <Keyboard className="h-4 w-4" />
      </Button>

      <input ref={bgFileRef} type="file" accept="image/*" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) onBackgroundImageUpload(file); }} />
    </div>
  );
}
