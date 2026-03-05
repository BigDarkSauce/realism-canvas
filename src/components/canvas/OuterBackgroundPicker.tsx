import { useState } from 'react';
import { Paintbrush } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

const PRESET_COLORS = [
  { label: 'Default', value: '' },
  { label: 'Slate', value: 'hsl(215 20% 20%)' },
  { label: 'Zinc', value: 'hsl(240 5% 15%)' },
  { label: 'Stone', value: 'hsl(25 5% 15%)' },
  { label: 'Warm Gray', value: 'hsl(30 10% 25%)' },
  { label: 'Navy', value: 'hsl(220 40% 13%)' },
  { label: 'Forest', value: 'hsl(150 30% 12%)' },
  { label: 'Wine', value: 'hsl(340 30% 15%)' },
  { label: 'Charcoal', value: 'hsl(0 0% 10%)' },
  { label: 'Cream', value: 'hsl(40 30% 92%)' },
  { label: 'Sky', value: 'hsl(200 30% 90%)' },
  { label: 'Mint', value: 'hsl(160 25% 88%)' },
];

interface OuterBackgroundPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export default function OuterBackgroundPicker({ value, onChange }: OuterBackgroundPickerProps) {
  const [custom, setCustom] = useState(value || '#1a1a2e');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 bg-toolbar border-toolbar-border"
          title="Outer background color"
        >
          <Paintbrush className="h-4 w-4" />
          <div
            className="h-4 w-4 rounded-sm border border-border"
            style={{ backgroundColor: value || 'hsl(var(--muted) / 0.3)' }}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="end">
        <p className="text-xs font-medium text-foreground mb-2">Outer Background</p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {PRESET_COLORS.map(c => (
            <button
              key={c.label}
              className="h-8 w-full rounded border border-border hover:ring-2 ring-primary transition-all"
              style={{ backgroundColor: c.value || 'hsl(var(--muted) / 0.3)' }}
              title={c.label}
              onClick={() => onChange(c.value)}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={custom}
            onChange={e => {
              setCustom(e.target.value);
              onChange(e.target.value);
            }}
            className="h-8 w-8 rounded cursor-pointer border-0"
          />
          <span className="text-xs text-muted-foreground">Custom color</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
