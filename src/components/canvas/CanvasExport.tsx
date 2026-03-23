import { useState } from 'react';
import { Block, Connection, Group } from '@/types/canvas';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export interface CanvasExportState {
  blocks: Block[];
  connections: Connection[];
  groups: Group[];
  canvasElement: HTMLElement | null;
}

interface CanvasExportProps {
  open: boolean;
  onClose: () => void;
  getState: () => CanvasExportState;
}

type ExportFormat = 'pdf' | 'word';

export default function CanvasExport({ open, onClose, getState }: CanvasExportProps) {
  const [title, setTitle] = useState('Canvas Export');
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const state = getState();
      const zip = new JSZip();

      // 1. Generate SVG canvas map showing all blocks, groups, and connections
      const svgMap = generateSvgMap(state);
      zip.file('canvas-map.svg', svgMap);

      // 2. Generate block documents organized by group (no attachments, no index)
      generateBlockDocuments(state, zip, format);

      // 3. Download ZIP
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `${sanitize(title)}.zip`);
      toast.success('Canvas exported successfully!');
      onClose();
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Canvas</DialogTitle>
          <DialogDescription>
            Export all blocks as documents organized by group, with an SVG canvas map showing structure and connections.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="export-title">Export Name</Label>
            <Input id="export-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="My Canvas" />
          </div>
          <div className="space-y-2">
            <Label>Document Format</Label>
            <RadioGroup value={format} onValueChange={v => setFormat(v as ExportFormat)} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pdf" id="fmt-pdf" />
                <Label htmlFor="fmt-pdf" className="cursor-pointer">PDF</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="word" id="fmt-word" />
                <Label htmlFor="fmt-word" className="cursor-pointer">Word (.doc)</Label>
              </div>
            </RadioGroup>
          </div>
        </div>
        <Button onClick={handleExport} disabled={exporting} className="w-full gap-2">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exporting ? 'Exporting…' : 'Export ZIP'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9 _-]/g, '_').trim() || 'export';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateSvgMap(state: CanvasExportState): string {
  const { blocks, connections, groups } = state;
  if (blocks.length === 0) return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><text x="10" y="30" font-size="14" fill="#888">Empty canvas</text></svg>';

  const padding = 60;
  const minX = Math.min(...blocks.map(b => b.x)) - padding;
  const minY = Math.min(...blocks.map(b => b.y)) - padding;
  const maxX = Math.max(...blocks.map(b => b.x + b.width)) + padding;
  const maxY = Math.max(...blocks.map(b => b.y + b.height)) + padding;
  const w = maxX - minX;
  const h = maxY - minY;

  const blockMap = new Map<string, Block>();
  blocks.forEach(b => blockMap.set(b.id, b));

  const groupColors = ['#059669', '#2563eb', '#dc2626', '#d97706', '#7c3aed', '#db2777'];
  const getGroupColor = (gId: string) => {
    const idx = groups.findIndex(g => g.id === gId);
    return groupColors[idx % groupColors.length];
  };

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="${Math.min(w, 4000)}" height="${Math.min(h, 4000)}" style="font-family:'Segoe UI',Arial,sans-serif;">`;

  // Background
  svg += `<rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="#f8fafc" rx="4"/>`;

  // Arrow marker defs
  svg += `<defs>`;
  svg += `<marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#64748b"/></marker>`;
  svg += `<filter id="shadow" x="-10%" y="-10%" width="130%" height="130%"><feDropShadow dx="1" dy="2" stdDeviation="3" flood-opacity="0.12"/></filter>`;
  svg += `</defs>`;

  // Draw group backgrounds with labels
  groups.forEach(g => {
    const gBlocks = blocks.filter(b => b.groupId === g.id);
    if (gBlocks.length === 0) return;
    const gx = Math.min(...gBlocks.map(b => b.x)) - 24;
    const gy = Math.min(...gBlocks.map(b => b.y)) - 40;
    const gw = Math.max(...gBlocks.map(b => b.x + b.width)) - gx + 24;
    const gh = Math.max(...gBlocks.map(b => b.y + b.height)) - gy + 24;
    const col = getGroupColor(g.id);
    svg += `<rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="12" fill="${col}" fill-opacity="0.08" stroke="${col}" stroke-width="2" stroke-dasharray="6 3"/>`;
    svg += `<text x="${gx + 12}" y="${gy + 20}" font-size="13" font-weight="600" fill="${col}" letter-spacing="0.5">${esc(g.label)}</text>`;
  });

  // Draw connections with curved paths and arrows
  connections.forEach(c => {
    const from = blockMap.get(c.fromId);
    const to = blockMap.get(c.toId);
    if (!from || !to) return;

    const fx = from.x + from.width / 2, fy = from.y + from.height / 2;
    const tx = to.x + to.width / 2, ty = to.y + to.height / 2;

    // Calculate edge intersection points for cleaner arrows
    const angle = Math.atan2(ty - fy, tx - fx);
    const fromEdgeX = fx + Math.cos(angle) * (from.width / 2);
    const fromEdgeY = fy + Math.sin(angle) * (from.height / 2);
    const toEdgeX = tx - Math.cos(angle) * (to.width / 2);
    const toEdgeY = ty - Math.sin(angle) * (to.height / 2);

    // Curved path via control point
    const midX = (fromEdgeX + toEdgeX) / 2;
    const midY = (fromEdgeY + toEdgeY) / 2;
    const dx = toEdgeX - fromEdgeX;
    const dy = toEdgeY - fromEdgeY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const curvature = Math.min(dist * 0.15, 40);
    const cpx = midX + (-dy / dist) * curvature;
    const cpy = midY + (dx / dist) * curvature;

    const strokeColor = c.color || '#64748b';
    const strokeW = c.strokeWidth || 2;
    const dashArray = c.arrowStyle === 'dashed' ? 'stroke-dasharray="8 4"' : c.arrowStyle === 'dotted' ? 'stroke-dasharray="2 4"' : '';

    svg += `<path d="M${fromEdgeX},${fromEdgeY} Q${cpx},${cpy} ${toEdgeX},${toEdgeY}" fill="none" stroke="${strokeColor}" stroke-width="${strokeW}" ${dashArray} marker-end="url(#arrow)"/>`;
  });

  // Draw blocks with shadow and shape support
  blocks.forEach(b => {
    const fill = b.bgColor || '#ffffff';
    const border = b.borderColor || '#cbd5e1';
    const textColor = b.textColor || '#1e293b';
    const rotation = b.rotation ? ` transform="rotate(${b.rotation} ${b.x + b.width / 2} ${b.y + b.height / 2})"` : '';

    if (b.shape === 'circle') {
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      const r = Math.min(b.width, b.height) / 2;
      svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${border}" stroke-width="2" filter="url(#shadow)"${rotation}/>`;
      svg += `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="11" fill="${textColor}" font-weight="500"${rotation}>${esc(b.label.slice(0, 40))}</text>`;
    } else if (b.shape === 'sticky') {
      svg += `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="4" fill="#fef9c3" stroke="#eab308" stroke-width="1.5" filter="url(#shadow)"${rotation}/>`;
      svg += `<text x="${b.x + b.width / 2}" y="${b.y + b.height / 2 + 5}" text-anchor="middle" font-size="11" fill="#713f12" font-weight="500"${rotation}>${esc(b.label.slice(0, 40))}</text>`;
    } else {
      svg += `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="8" fill="${fill}" stroke="${border}" stroke-width="2" filter="url(#shadow)"${rotation}/>`;
      svg += `<text x="${b.x + b.width / 2}" y="${b.y + b.height / 2 + 5}" text-anchor="middle" font-size="11" fill="${textColor}" font-weight="500"${rotation}>${esc(b.label.slice(0, 40))}</text>`;
    }

    // Show file attachment indicator
    if (b.fileStorageUrl || b.fileUrl) {
      svg += `<text x="${b.x + b.width - 8}" y="${b.y + 14}" text-anchor="end" font-size="10" fill="#94a3b8">📎</text>`;
    }
  });

  // Legend at bottom
  const legendY = maxY - 20;
  svg += `<text x="${minX + 10}" y="${legendY}" font-size="10" fill="#94a3b8">${blocks.length} blocks · ${connections.length} connections · ${groups.length} groups</text>`;

  svg += '</svg>';
  return svg;
}

function generateBlockDocument(block: Block, format: ExportFormat): { content: string; ext: string } {
  const notes = block.markdown || block.comment || '';
  const fileUrl = block.fileStorageUrl || block.fileUrl || '';
  const fileName = block.fileName || '';

  if (format === 'word') {
    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="utf-8">
<style>body{font-family:Calibri,Arial,sans-serif;font-size:12pt;color:#1a1a2e;margin:40px;line-height:1.6;}h1{font-size:18pt;border-bottom:2px solid #6ee7b7;padding-bottom:6px;}a{color:#2563eb;}</style>
</head><body>
<h1>${esc(block.label)}</h1>
<p style="color:#888;font-size:10pt;">Shape: ${block.shape || 'rectangle'} | Size: ${block.width}×${block.height}</p>
${notes ? `<h2 style="font-size:14pt;margin-top:20px;">Notes</h2><div style="white-space:pre-wrap;">${esc(notes)}</div>` : ''}
${fileUrl ? `<h2 style="font-size:14pt;margin-top:20px;">Attached File</h2><p><a href="${esc(fileUrl)}" target="_blank">📎 ${esc(fileName || 'Open file')}</a></p>` : ''}
</body></html>`;
    return { content: html, ext: '.doc' };
  } else {
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(block.label)}</title>
<style>
@media print { body { margin: 0; } @page { margin: 1in; } }
body{font-family:Arial,sans-serif;font-size:12pt;color:#1a1a2e;max-width:700px;margin:40px auto;line-height:1.6;}
h1{font-size:20pt;border-bottom:3px solid #6ee7b7;padding-bottom:8px;margin-bottom:16px;}
.meta{color:#888;font-size:10pt;margin-bottom:24px;}
a{color:#2563eb;}
h2{font-size:14pt;color:#2d3748;margin-top:24px;}
.notes{white-space:pre-wrap;background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0;}
</style></head><body>
<h1>${esc(block.label)}</h1>
<p class="meta">Shape: ${block.shape || 'rectangle'} | Size: ${block.width}×${block.height}</p>
${notes ? `<h2>Notes</h2><div class="notes">${esc(notes)}</div>` : ''}
${fileUrl ? `<h2>Attached File</h2><p><a href="${esc(fileUrl)}" target="_blank">📎 ${esc(fileName || 'Open file')}</a></p>` : ''}
<script>window.onload=()=>{if(location.protocol!=='file:')return;window.print();}</script>
</body></html>`;
    return { content: html, ext: '.html' };
  }
}

function generateBlockDocuments(state: CanvasExportState, zip: JSZip, format: ExportFormat): void {
  const { blocks, groups } = state;
  const groupMap = new Map<string, Group>();
  groups.forEach(g => groupMap.set(g.id, g));

  const grouped = new Map<string, Block[]>();
  const ungrouped: Block[] = [];

  blocks.forEach(b => {
    if (b.groupId && groupMap.has(b.groupId)) {
      const arr = grouped.get(b.groupId) || [];
      arr.push(b);
      grouped.set(b.groupId, arr);
    } else {
      ungrouped.push(b);
    }
  });

  for (const [gId, gBlocks] of grouped.entries()) {
    const group = groupMap.get(gId)!;
    const folderName = sanitize(group.label);
    const folder = zip.folder(folderName)!;

    for (const block of gBlocks) {
      const { content, ext } = generateBlockDocument(block, format);
      folder.file(`${sanitize(block.label)}${ext}`, format === 'word' ? new Blob(['\ufeff', content], { type: 'application/msword' }) : content);
    }
  }

  if (ungrouped.length > 0) {
    const folder = zip.folder('Ungrouped')!;
    for (const block of ungrouped) {
      const { content, ext } = generateBlockDocument(block, format);
      folder.file(`${sanitize(block.label)}${ext}`, format === 'word' ? new Blob(['\ufeff', content], { type: 'application/msword' }) : content);
    }
  }
}
