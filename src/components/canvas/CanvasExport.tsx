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
import jsPDF from 'jspdf';

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

      // 1. Generate visual canvas map PDF
      const mapPdf = generateCanvasMapPdf(state);
      zip.file('canvas-map.pdf', mapPdf, { binary: true });

      // 2. Generate block documents organized by group
      generateBlockDocuments(state, zip, format);

      // 3. Download ZIP
      const zipData = await zip.generateAsync({
        type: 'uint8array',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      const zipBuffer = zipData.buffer.slice(zipData.byteOffset, zipData.byteOffset + zipData.byteLength) as ArrayBuffer;
      saveAs(new Blob([zipBuffer], { type: 'application/zip' }), `${sanitize(title)}.zip`);
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
            Export all blocks as documents organized by group, with a visual canvas map PDF.
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

/**
 * Generate a visual PDF diagram of the canvas using jsPDF.
 * Draws blocks as boxes, groups as outlines, and connections as arrows.
 */
function generateCanvasMapPdf(state: CanvasExportState): Uint8Array {
  const { blocks, connections, groups } = state;
  if (blocks.length === 0) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(16);
    doc.text('Canvas Map - No blocks', 40, 40);
    return new Uint8Array(doc.output('arraybuffer'));
  }

  // Compute bounding box of all blocks
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of blocks) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }

  const padding = 60;
  const contentW = maxX - minX + padding * 2;
  const contentH = maxY - minY + padding * 2;

  // Use landscape A4 and scale to fit
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2 - 30; // reserve space for title
  const scale = Math.min(availW / contentW, availH / contentH, 1.5);

  const offsetX = margin + (availW - contentW * scale) / 2;
  const offsetY = margin + 30 + (availH - contentH * scale) / 2;

  const tx = (x: number) => offsetX + (x - minX + padding) * scale;
  const ty = (y: number) => offsetY + (y - minY + padding) * scale;

  // Title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text('Canvas Structure Map', margin, margin + 16);

  // Summary
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(`${blocks.length} blocks, ${groups.length} groups, ${connections.length} connections`, margin, margin + 28);

  // Draw group outlines
  const groupMap = new Map<string, Group>();
  groups.forEach(g => groupMap.set(g.id, g));

  for (const group of groups) {
    const gBlocks = blocks.filter(b => b.groupId === group.id);
    if (gBlocks.length === 0) continue;

    let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
    for (const b of gBlocks) {
      gMinX = Math.min(gMinX, b.x);
      gMinY = Math.min(gMinY, b.y);
      gMaxX = Math.max(gMaxX, b.x + b.width);
      gMaxY = Math.max(gMaxY, b.y + b.height);
    }

    const gPad = 20;
    const rx = tx(gMinX - gPad);
    const ry = ty(gMinY - gPad - 18);
    const rw = (gMaxX - gMinX + gPad * 2) * scale;
    const rh = (gMaxY - gMinY + gPad * 2 + 18) * scale;

    doc.setDrawColor(100, 149, 237); // cornflower blue
    doc.setLineWidth(1.5);
    doc.setLineDashPattern([4, 3], 0);
    doc.roundedRect(rx, ry, rw, rh, 6, 6, 'S');
    doc.setLineDashPattern([], 0);

    // Group label
    doc.setFontSize(9 * Math.min(scale, 1));
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(70, 100, 200);
    doc.text(group.label, rx + 6, ry + 10);
  }

  // Draw blocks
  const blockMap = new Map<string, Block>();
  blocks.forEach(b => blockMap.set(b.id, b));

  for (const b of blocks) {
    const bx = tx(b.x);
    const by = ty(b.y);
    const bw = b.width * scale;
    const bh = b.height * scale;

    // Block fill
    doc.setFillColor(245, 245, 250);
    doc.setDrawColor(80, 80, 100);
    doc.setLineWidth(1);

    if (b.shape === 'circle') {
      const cx = bx + bw / 2;
      const cy = by + bh / 2;
      const r = Math.min(bw, bh) / 2;
      doc.circle(cx, cy, r, 'FD');
    } else {
      doc.roundedRect(bx, by, bw, bh, 4, 4, 'FD');
    }

    // Block label
    const fontSize = Math.max(6, Math.min(10, 9 * scale));
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(20, 20, 40);
    const labelLines = doc.splitTextToSize(b.label, bw - 8);
    const textStartY = by + bh / 2 - (labelLines.length - 1) * (fontSize * 0.6);
    for (let i = 0; i < Math.min(labelLines.length, 3); i++) {
      doc.text(labelLines[i], bx + bw / 2, textStartY + i * (fontSize * 1.2), { align: 'center' });
    }
  }

  // Draw connections with arrows
  doc.setDrawColor(60, 60, 80);
  doc.setLineWidth(1);

  for (const conn of connections) {
    const fromBlock = blockMap.get(conn.fromId);
    const toBlock = blockMap.get(conn.toId);
    if (!fromBlock || !toBlock) continue;

    const x1 = tx(fromBlock.x + fromBlock.width / 2);
    const y1 = ty(fromBlock.y + fromBlock.height / 2);
    const x2 = tx(toBlock.x + toBlock.width / 2);
    const y2 = ty(toBlock.y + toBlock.height / 2);

    // Clip to block edges
    const clip = (cx: number, cy: number, bw: number, bh: number, ex: number, ey: number) => {
      const dx = ex - cx;
      const dy = ey - cy;
      const hw = bw / 2;
      const hh = bh / 2;
      if (dx === 0 && dy === 0) return { x: cx, y: cy };
      const tX = dx !== 0 ? hw / Math.abs(dx) : Infinity;
      const tY = dy !== 0 ? hh / Math.abs(dy) : Infinity;
      const t = Math.min(tX, tY);
      return { x: cx + dx * t, y: cy + dy * t };
    };

    const from = clip(x1, y1, fromBlock.width * scale, fromBlock.height * scale, x2, y2);
    const to = clip(x2, y2, toBlock.width * scale, toBlock.height * scale, x1, y1);

    // Line style
    if (conn.arrowStyle === 'dashed' || conn.arrowStyle === 'dotted') {
      doc.setLineDashPattern([4, 3], 0);
    }
    doc.line(from.x, from.y, to.x, to.y);
    doc.setLineDashPattern([], 0);

    // Arrowhead
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const aLen = 8;
    const aW = Math.PI / 7;
    doc.triangle(
      to.x, to.y,
      to.x - aLen * Math.cos(angle - aW), to.y - aLen * Math.sin(angle - aW),
      to.x - aLen * Math.cos(angle + aW), to.y - aLen * Math.sin(angle + aW),
      'F'
    );
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

/**
 * Generate a real PDF for a block using jsPDF.
 */
function generateBlockPdf(block: Block): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 50;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  const titleLines = doc.splitTextToSize(block.label, maxWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 22 + 8;

  // Divider line
  doc.setDrawColor(110, 231, 183); // green accent
  doc.setLineWidth(2);
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;

  // Meta info
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(`Shape: ${block.shape || 'rectangle'}  |  Size: ${block.width}×${block.height}`, margin, y);
  y += 20;

  // Notes
  const notes = block.markdown || block.comment || '';
  if (notes) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(45, 55, 72);
    doc.text('Notes', margin, y);
    y += 18;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    const noteLines = doc.splitTextToSize(notes, maxWidth);
    const pageHeight = doc.internal.pageSize.getHeight();
    for (const line of noteLines) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += 15;
    }
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

function generateBlockWordDoc(block: Block): Uint8Array {
  const notes = block.markdown || block.comment || '';
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="utf-8">
<style>body{font-family:Calibri,Arial,sans-serif;font-size:12pt;color:#1a1a2e;margin:40px;line-height:1.6;}h1{font-size:18pt;border-bottom:2px solid #6ee7b7;padding-bottom:6px;}a{color:#2563eb;}</style>
</head><body>
<h1>${esc(block.label)}</h1>
<p style="color:#888;font-size:10pt;">Shape: ${block.shape || 'rectangle'} | Size: ${block.width}×${block.height}</p>
${notes ? `<h2 style="font-size:14pt;margin-top:20px;">Notes</h2><div style="white-space:pre-wrap;">${esc(notes)}</div>` : ''}
</body></html>`;
  return new TextEncoder().encode(`\ufeff${html}`);
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

  const ext = format === 'pdf' ? '.pdf' : '.doc';

  for (const [gId, gBlocks] of grouped.entries()) {
    const group = groupMap.get(gId)!;
    const folderName = sanitize(group.label);
    const folder = zip.folder(folderName)!;

    for (const block of gBlocks) {
      const fileData = format === 'pdf' ? generateBlockPdf(block) : generateBlockWordDoc(block);
      folder.file(`${sanitize(block.label)}${ext}`, fileData, { binary: true });
    }
  }

  if (ungrouped.length > 0) {
    const folder = zip.folder('Ungrouped')!;
    for (const block of ungrouped) {
      const fileData = format === 'pdf' ? generateBlockPdf(block) : generateBlockWordDoc(block);
      folder.file(`${sanitize(block.label)}${ext}`, fileData, { binary: true });
    }
  }
}
