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
import html2canvas from 'html2canvas';

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

      // 1. Generate canvas map screenshot
      await generateCanvasMap(state, zip);

      // 2. Generate block documents organized by group
      await generateBlockDocuments(state, zip, format);

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
            Export all blocks as documents organized by group, with a canvas map screenshot.
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

async function generateCanvasMap(state: CanvasExportState, zip: JSZip): Promise<void> {
  const { canvasElement } = state;
  if (!canvasElement) return;

  // Find the inner canvas (the transformed div with blocks)
  const innerCanvas = canvasElement.querySelector('[data-canvas-bg="true"]')?.parentElement?.parentElement;
  if (!innerCanvas) return;

  // Get the actual canvas content div (the one with transform)
  const contentDiv = innerCanvas.querySelector(':scope > div:last-child') as HTMLElement;
  if (!contentDiv) return;

  try {
    const canvas = await html2canvas(contentDiv, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: contentDiv.scrollWidth,
      height: contentDiv.scrollHeight,
      // Remove transform for clean screenshot
      onclone: (doc) => {
        const clonedDiv = doc.querySelector('[data-canvas-bg="true"]')?.parentElement?.parentElement?.querySelector(':scope > div:last-child') as HTMLElement;
        if (clonedDiv) {
          clonedDiv.style.transform = 'none';
          clonedDiv.style.position = 'relative';
        }
      }
    });

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob(b => resolve(b!), 'image/png');
    });

    zip.file('canvas-map.png', blob);
  } catch (err) {
    console.warn('Canvas screenshot failed, generating SVG map instead:', err);
    // Fallback: generate an SVG map
    const svgMap = generateSvgMap(state);
    zip.file('canvas-map.svg', svgMap);
  }
}

function generateSvgMap(state: CanvasExportState): string {
  const { blocks, connections, groups } = state;
  if (blocks.length === 0) return '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>';

  const minX = Math.min(...blocks.map(b => b.x)) - 40;
  const minY = Math.min(...blocks.map(b => b.y)) - 40;
  const maxX = Math.max(...blocks.map(b => b.x + b.width)) + 40;
  const maxY = Math.max(...blocks.map(b => b.y + b.height)) + 40;
  const w = maxX - minX;
  const h = maxY - minY;

  const blockMap = new Map<string, Block>();
  blocks.forEach(b => blockMap.set(b.id, b));

  const groupMap = new Map<string, Group>();
  groups.forEach(g => groupMap.set(g.id, g));

  // Group colors
  const groupColors = ['#6ee7b7', '#93c5fd', '#fca5a5', '#fcd34d', '#c4b5fd', '#f9a8d4'];
  const getGroupColor = (gId: string) => {
    const idx = groups.findIndex(g => g.id === gId);
    return groupColors[idx % groupColors.length];
  };

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="${w}" height="${h}" style="font-family:Arial,sans-serif;">`;
  svg += `<rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="#f8fafc"/>`;

  // Draw group rectangles
  groups.forEach(g => {
    const gBlocks = blocks.filter(b => b.groupId === g.id);
    if (gBlocks.length === 0) return;
    const gx = Math.min(...gBlocks.map(b => b.x)) - 20;
    const gy = Math.min(...gBlocks.map(b => b.y)) - 30;
    const gw = Math.max(...gBlocks.map(b => b.x + b.width)) - gx + 20;
    const gh = Math.max(...gBlocks.map(b => b.y + b.height)) - gy + 20;
    const col = getGroupColor(g.id);
    svg += `<rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="8" fill="${col}" fill-opacity="0.15" stroke="${col}" stroke-width="2"/>`;
    svg += `<text x="${gx + 8}" y="${gy + 16}" font-size="12" font-weight="bold" fill="${col}">${esc(g.label)}</text>`;
  });

  // Draw connections with arrows
  connections.forEach(c => {
    const from = blockMap.get(c.fromId);
    const to = blockMap.get(c.toId);
    if (!from || !to) return;
    const fx = from.x + from.width / 2, fy = from.y + from.height / 2;
    const tx = to.x + to.width / 2, ty = to.y + to.height / 2;
    const angle = Math.atan2(ty - fy, tx - fx);
    const arrowLen = 10;
    const ax = tx - Math.cos(angle) * arrowLen;
    const ay = ty - Math.sin(angle) * arrowLen;
    svg += `<line x1="${fx}" y1="${fy}" x2="${tx}" y2="${ty}" stroke="#94a3b8" stroke-width="2" marker-end="url(#arrow)"/>`;
  });

  // Arrow marker
  svg += `<defs><marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#94a3b8"/></marker></defs>`;

  // Draw blocks
  blocks.forEach(b => {
    const fill = b.bgColor || '#ffffff';
    const border = b.borderColor || '#cbd5e1';
    const radius = b.shape === 'circle' ? Math.min(b.width, b.height) / 2 : 8;

    if (b.shape === 'circle') {
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      const r = Math.min(b.width, b.height) / 2;
      svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${border}" stroke-width="2"/>`;
      svg += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" fill="#1e293b">${esc(b.label.slice(0, 30))}</text>`;
    } else {
      svg += `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${radius}" fill="${fill}" stroke="${border}" stroke-width="2"/>`;
      svg += `<text x="${b.x + b.width / 2}" y="${b.y + b.height / 2 + 4}" text-anchor="middle" font-size="11" fill="#1e293b">${esc(b.label.slice(0, 30))}</text>`;
    }
  });

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
    // PDF-friendly HTML (will be saved as .html for now, user can print to PDF)
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

async function generateBlockDocuments(state: CanvasExportState, zip: JSZip, format: ExportFormat): Promise<void> {
  const { blocks, groups } = state;
  const groupMap = new Map<string, Group>();
  groups.forEach(g => groupMap.set(g.id, g));

  // Organize blocks by group
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

  // Create group folders
  for (const [gId, gBlocks] of grouped.entries()) {
    const group = groupMap.get(gId)!;
    const folderName = sanitize(group.label);
    const folder = zip.folder(folderName)!;

    for (const block of gBlocks) {
      const { content, ext } = generateBlockDocument(block, format);
      folder.file(`${sanitize(block.label)}${ext}`, format === 'word' ? new Blob(['\ufeff', content], { type: 'application/msword' }) : content);

      // Also fetch and include attached files if possible
      await tryFetchAttachment(block, folder);
    }
  }

  // Ungrouped blocks
  if (ungrouped.length > 0) {
    const folder = zip.folder('Ungrouped')!;
    for (const block of ungrouped) {
      const { content, ext } = generateBlockDocument(block, format);
      folder.file(`${sanitize(block.label)}${ext}`, format === 'word' ? new Blob(['\ufeff', content], { type: 'application/msword' }) : content);
      await tryFetchAttachment(block, folder);
    }
  }

  // Generate index/TOC document
  const indexDoc = generateIndexDocument(state, format);
  zip.file(`_index${indexDoc.ext}`, format === 'word' ? new Blob(['\ufeff', indexDoc.content], { type: 'application/msword' }) : indexDoc.content);
}

async function tryFetchAttachment(block: Block, folder: JSZip): Promise<void> {
  const url = block.fileStorageUrl || block.fileUrl;
  if (!url) return;

  try {
    const resp = await fetch(url);
    if (!resp.ok) return;
    const blob = await resp.blob();
    const name = block.fileName || `attachment-${block.id.slice(0, 8)}`;
    folder.file(`attachments/${sanitize(name)}`, blob);
  } catch {
    // Silently skip failed attachment downloads
  }
}

function generateIndexDocument(state: CanvasExportState, format: ExportFormat): { content: string; ext: string } {
  const { blocks, connections, groups } = state;
  const blockMap = new Map<string, Block>();
  blocks.forEach(b => blockMap.set(b.id, b));
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

  let body = `<h1>Canvas Index</h1>`;
  body += `<p style="color:#888;font-size:10pt;">Generated on ${new Date().toLocaleString()} — ${blocks.length} blocks, ${connections.length} connections, ${groups.length} groups</p>`;

  // Groups
  groups.forEach(g => {
    const gBlocks = grouped.get(g.id) || [];
    body += `<h2>📁 ${esc(g.label)} (${gBlocks.length} blocks)</h2><ul>`;
    gBlocks.forEach(b => {
      body += `<li><strong>${esc(b.label)}</strong>${b.fileName ? ` — 📎 ${esc(b.fileName)}` : ''}</li>`;
    });
    body += '</ul>';
  });

  if (ungrouped.length > 0) {
    body += `<h2>📄 Ungrouped (${ungrouped.length} blocks)</h2><ul>`;
    ungrouped.forEach(b => {
      body += `<li><strong>${esc(b.label)}</strong>${b.fileName ? ` — 📎 ${esc(b.fileName)}` : ''}</li>`;
    });
    body += '</ul>';
  }

  // Connections
  if (connections.length > 0) {
    body += `<h2>🔗 Connections</h2><ul>`;
    connections.forEach(c => {
      const from = blockMap.get(c.fromId);
      const to = blockMap.get(c.toId);
      if (from && to) body += `<li>${esc(from.label)} → ${esc(to.label)}</li>`;
    });
    body += '</ul>';
  }

  if (format === 'word') {
    return {
      content: `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="utf-8"><style>body{font-family:Calibri,Arial,sans-serif;font-size:12pt;color:#1a1a2e;margin:40px;line-height:1.6;}h1{font-size:22pt;border-bottom:3px solid #6ee7b7;padding-bottom:8px;}h2{font-size:16pt;}a{color:#2563eb;}</style></head><body>${body}</body></html>`,
      ext: '.doc',
    };
  }
  return {
    content: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Canvas Index</title>
<style>body{font-family:Arial,sans-serif;font-size:12pt;color:#1a1a2e;max-width:700px;margin:40px auto;line-height:1.6;}h1{font-size:22pt;border-bottom:3px solid #6ee7b7;padding-bottom:8px;}h2{font-size:16pt;}a{color:#2563eb;}</style></head><body>${body}</body></html>`,
    ext: '.html',
  };
}
