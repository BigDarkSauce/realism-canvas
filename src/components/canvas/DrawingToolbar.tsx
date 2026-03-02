import { Paintbrush, Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CanvasTool } from '@/types/canvas';

interface DrawingToolbarProps {
  tool: CanvasTool;
  setTool: (t: CanvasTool) => void;
  color: string;
  setColor: (c: string) => void;
  brushWidth: number;
  setBrushWidth: (w: number) => void;
}

const COLORS = [
  '#000000', '#ffffff', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
  '#0ea5e9', '#14b8a6', '#a855f7', '#f43f5e', '#d97706',
];

export default function DrawingToolbar({ tool, setTool, color, setColor, brushWidth, setBrushWidth }: DrawingToolbarProps) {
  return (
    <div className="absolute top-4 right-4 z-50 flex flex-col items-center gap-1 px-2 py-2 bg-toolbar border border-toolbar-border rounded-xl shadow-lg">
      <Button
        variant={tool === 'draw' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setTool(tool === 'draw' ? 'select' : 'draw')}
        title="Draw"
        className="h-9 w-9 p-0"
      >
        <Paintbrush className="h-4 w-4" />
      </Button>
      <Button
        variant={tool === 'eraser' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setTool(tool === 'eraser' ? 'select' : 'eraser')}
        title="Eraser"
        className="h-9 w-9 p-0"
      >
        <Eraser className="h-4 w-4" />
      </Button>

      <div className="w-px h-4 bg-border" />

      <Popover>
        <PopoverTrigger asChild>
          <button
            className="h-7 w-7 rounded-md border-2 border-border"
            style={{ backgroundColor: color }}
            title="Pick color"
          />
        </PopoverTrigger>
        <PopoverContent side="left" className="w-auto p-2">
          <div className="grid grid-cols-5 gap-1">
            {COLORS.map(c => (
              <button
                key={c}
                className="h-6 w-6 rounded-sm border border-border hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <div className="mt-2">
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="w-full h-7 cursor-pointer"
            />
          </div>
        </PopoverContent>
      </Popover>

      <div className="w-full px-1">
        <Slider
          value={[brushWidth]}
          onValueChange={v => setBrushWidth(v[0])}
          min={1}
          max={20}
          step={1}
          className="w-full"
        />
      </div>
    </div>
  );
}
