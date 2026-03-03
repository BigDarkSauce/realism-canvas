import { useState } from 'react';
import { Block } from '@/types/canvas';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const FONT_SIZE_OPTIONS = [
  '10px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px',
];

interface BlockEditorProps {
  block: Block | null;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Block>) => void;
}

export default function BlockEditor({ block, onClose, onSave }: BlockEditorProps) {
  const [label, setLabel] = useState(block?.label || '');
  const [fileUrl, setFileUrl] = useState(block?.fileUrl || '');
  const [fileName, setFileName] = useState(block?.fileName || '');
  const [width, setWidth] = useState(block?.width || 160);
  const [height, setHeight] = useState(block?.height || 56);
  const [fontSize, setFontSize] = useState(block?.fontSize || '14px');

  if (!block) return null;

  const handleSave = () => {
    onSave(block.id, { label, fileUrl, fileName, width, height, fontSize });
    onClose();
  };

  return (
    <Dialog open={!!block} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">Edit Block</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="label">Label</Label>
            <Input id="label" value={label} onChange={e => setLabel(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fontSize">Text Size</Label>
            <Select value={fontSize} onValueChange={setFontSize}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_SIZE_OPTIONS.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fileName">File Name (display)</Label>
            <Input id="fileName" value={fileName} onChange={e => setFileName(e.target.value)} placeholder="report.pdf" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fileUrl">File URL (opens on click)</Label>
            <Input id="fileUrl" value={fileUrl} onChange={e => setFileUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="width">Width</Label>
              <Input id="width" type="number" value={width} onChange={e => setWidth(+e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="height">Height</Label>
              <Input id="height" type="number" value={height} onChange={e => setHeight(+e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
