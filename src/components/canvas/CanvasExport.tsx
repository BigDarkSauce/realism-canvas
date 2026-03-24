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
/**
 * Parse a CSS color string (hex, rgb, hsl, named) to [r, g, b] (0-255).
 */
function parseColor(color: string | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!color) return fallback;
  const s = color.trim();

  // hex
  const hexMatch = s.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    if (hex.length >= 6) {
      return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
    }
  }

  // rgb(r, g, b)
  const rgbMatch = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) return [+rgbMatch[1], +rgbMatch[2], +rgbMatch[3]];

  // hsl(h, s%, l%)
  const hslMatch = s.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/);
  if (hslMatch) {
    const h = +hslMatch[1] / 360, sat = +hslMatch[2] / 100, l = +hslMatch[3] / 100;
    if (sat === 0) { const v = Math.round(l * 255); return [v, v, v]; }
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    const p = 2 * l - q;
    return [Math.round(hue2rgb(p, q, h + 1/3) * 255), Math.round(hue2rgb(p, q, h) * 255), Math.round(hue2rgb(p, q, h - 1/3) * 255)];
  }

  // named colors (common ones)
  const named: Record<string, [number,number,number]> = {
    white:[255,255,255], black:[0,0,0], red:[255,0,0], green:[0,128,0], blue:[0,0,255],
    yellow:[255,255,0], orange:[255,165,0], purple:[128,0,128], pink:[255,192,203],
    gray:[128,128,128], grey:[128,128,128], transparent:[255,255,255],
  };
  if (named[s.toLowerCase()]) return named[s.toLowerCase()];

  return fallback;
}

function parseFontSize(fs: string | undefined, defaultPt: number): number {
  if (!fs) return defaultPt;
  const n = parseFloat(fs);
  if (isNaN(n)) return defaultPt;
  if (fs.includes('rem')) return n * 12;
  if (fs.includes('em')) return n * 12;
  return n; // px treated as pt roughly
}

function generateCanvasMapPdf(state: CanvasExportState): Uint8Array {
  const { blocks, connections, groups } = state;
  if (blocks.length === 0) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(16);
    doc.text('Canvas Map - No blocks', 40, 40);
    return new Uint8Array(doc.output('arraybuffer'));
  }

  // Compute bounding box
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

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2 - 30;
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

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(`${blocks.length} blocks, ${groups.length} groups, ${connections.length} connections`, margin, margin + 28);

  // Draw group outlines with actual group colors
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

    // Use actual group bg color with transparency effect
    const groupBg = parseColor(group.bgColor, [100, 149, 237]);
    doc.setDrawColor(groupBg[0], groupBg[1], groupBg[2]);
    // Light fill for the group area
    doc.setFillColor(
      Math.min(255, groupBg[0] + Math.round((255 - groupBg[0]) * 0.85)),
      Math.min(255, groupBg[1] + Math.round((255 - groupBg[1]) * 0.85)),
      Math.min(255, groupBg[2] + Math.round((255 - groupBg[2]) * 0.85))
    );
    doc.setLineWidth(1.5);
    doc.setLineDashPattern([4, 3], 0);
    doc.roundedRect(rx, ry, rw, rh, 6, 6, 'FD');
    doc.setLineDashPattern([], 0);

    // Group label with actual text color and scale
    const labelScale = group.labelScale ?? 1;
    const groupFontSize = parseFontSize(group.fontSize, 9) * Math.min(scale, 1) * labelScale;
    doc.setFontSize(Math.max(6, groupFontSize));
    doc.setFont('helvetica', 'bold');
    const txtColor = parseColor(group.textColor, [groupBg[0], groupBg[1], groupBg[2]]);
    doc.setTextColor(txtColor[0], txtColor[1], txtColor[2]);

    // Position label at top-center, offset by labelOffsetX
    const labelX = rx + rw / 2 + (group.labelOffsetX ?? 0) * scale;
    const labelY = ry + groupFontSize * 0.8 + 4;

    // Draw bordered label box
    const labelW = doc.getTextWidth(group.label) + 12;
    const labelH = groupFontSize + 8;
    doc.setDrawColor(groupBg[0], groupBg[1], groupBg[2]);
    doc.setFillColor(255, 255, 255);
    doc.setLineWidth(1);
    doc.roundedRect(labelX - labelW / 2, labelY - groupFontSize * 0.7 - 3, labelW, labelH, 3, 3, 'FD');
    doc.setTextColor(txtColor[0], txtColor[1], txtColor[2]);
    doc.text(group.label, labelX, labelY, { align: 'center' });
  }

  // Draw blocks with actual colors, shapes, borders, rotation
  const blockMap = new Map<string, Block>();
  blocks.forEach(b => blockMap.set(b.id, b));

  for (const b of blocks) {
    const bx = tx(b.x);
    const by = ty(b.y);
    const bw = b.width * scale;
    const bh = b.height * scale;

    // Use actual block colors
    const bgCol = parseColor(b.bgColor, b.shape === 'sticky' ? [255, 249, 196] : [245, 245, 250]);
    const borderCol = parseColor(b.borderColor, [80, 80, 100]);
    const textCol = parseColor(b.textColor, [20, 20, 40]);

    doc.setFillColor(bgCol[0], bgCol[1], bgCol[2]);
    doc.setDrawColor(borderCol[0], borderCol[1], borderCol[2]);
    doc.setLineWidth(1);

    // Border style
    if (b.borderStyle === 'dashed') doc.setLineDashPattern([4, 3], 0);
    else if (b.borderStyle === 'dotted') doc.setLineDashPattern([1.5, 2], 0);

    // Apply rotation via PDF transform if block is rotated
    const rotation = b.rotation ?? 0;
    const cx = bx + bw / 2;
    const cy = by + bh / 2;
    const needsRotation = Math.abs(rotation) > 0.5;

    if (needsRotation) {
      doc.saveGraphicsState();
      const rad = (rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      // Translate to center, rotate, translate back
      const internal = (doc as any).internal;
      const f2 = (n: number) => n.toFixed(4);
      internal.write(`${f2(cos)} ${f2(sin)} ${f2(-sin)} ${f2(cos)} ${f2(cx)} ${f2(pageH - cy)} cm`);
      // Draw centered at origin
      if (b.shape === 'circle') {
        const r = Math.min(bw, bh) / 2;
        doc.circle(0, 0, r, 'FD');
      } else {
        doc.roundedRect(-bw / 2, -bh / 2, bw, bh, b.shape === 'sticky' ? 2 : 4, b.shape === 'sticky' ? 2 : 4, 'FD');
      }

      // Sticky note fold
      if (b.shape === 'sticky') {
        const foldSize = 10 * scale;
        doc.setFillColor(Math.max(0, bgCol[0] - 30), Math.max(0, bgCol[1] - 30), Math.max(0, bgCol[2] - 30));
        doc.triangle(bw / 2 - foldSize, -bh / 2, bw / 2, -bh / 2, bw / 2, -bh / 2 + foldSize, 'F');
      }

      // Text
      const fontSize = Math.max(6, Math.min(parseFontSize(b.fontSize, 10), 14) * scale);
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', b.shape === 'text' ? 'normal' : 'normal');
      doc.setTextColor(textCol[0], textCol[1], textCol[2]);
      const labelLines = doc.splitTextToSize(b.label, bw - 8);
      const textStartY = -(labelLines.length - 1) * (fontSize * 0.6);
      for (let i = 0; i < Math.min(labelLines.length, 4); i++) {
        doc.text(labelLines[i], 0, textStartY + i * (fontSize * 1.2), { align: 'center' });
      }

      doc.restoreGraphicsState();
    } else {
      // No rotation - draw normally
      if (b.shape === 'circle') {
        const r = Math.min(bw, bh) / 2;
        doc.circle(cx, cy, r, 'FD');
      } else {
        doc.roundedRect(bx, by, bw, bh, b.shape === 'sticky' ? 2 : 4, b.shape === 'sticky' ? 2 : 4, 'FD');
      }

      // Sticky note fold corner
      if (b.shape === 'sticky') {
        const foldSize = 10 * scale;
        doc.setFillColor(Math.max(0, bgCol[0] - 30), Math.max(0, bgCol[1] - 30), Math.max(0, bgCol[2] - 30));
        doc.triangle(bx + bw - foldSize, by, bx + bw, by, bx + bw, by + foldSize, 'F');
      }

      // Block label with actual text color and font size
      const fontSize = Math.max(6, Math.min(parseFontSize(b.fontSize, 10), 14) * scale);
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(textCol[0], textCol[1], textCol[2]);
      const labelLines = doc.splitTextToSize(b.label, bw - 8);
      const textStartY = by + bh / 2 - (labelLines.length - 1) * (fontSize * 0.6);
      for (let i = 0; i < Math.min(labelLines.length, 4); i++) {
        doc.text(labelLines[i], cx, textStartY + i * (fontSize * 1.2), { align: 'center' });
      }
    }

    doc.setLineDashPattern([], 0);
  }

  // Draw connections with actual colors, widths, styles, and curves (matching canvas exactly)
  // Replicate getEdgePoint from ConnectionArrows.tsx
  const getEdgePointPdf = (fromPt: {x:number,y:number}, toPt: {x:number,y:number}, block: Block) => {
    const cx = tx(block.x + block.width / 2);
    const cy = ty(block.y + block.height / 2);
    const hw = (block.width * scale) / 2;
    const hh = (block.height * scale) / 2;
    const dx = toPt.x - fromPt.x;
    const dy = toPt.y - fromPt.y;
    const angle = Math.atan2(dy, dx);
    const absCos = Math.abs(Math.cos(angle));
    const absSin = Math.abs(Math.sin(angle));
    let px: number, py: number;
    if (hw * absSin < hh * absCos) {
      const sign = Math.cos(angle) > 0 ? 1 : -1;
      px = cx + sign * hw;
      py = cy + sign * hw * Math.tan(angle);
    } else {
      const sign = Math.sin(angle) > 0 ? 1 : -1;
      px = cx + sign * hh / Math.tan(angle);
      py = cy + sign * hh;
    }
    return { x: px, y: py };
  };

  for (const conn of connections) {
    const fromBlock = blockMap.get(conn.fromId);
    const toBlock = blockMap.get(conn.toId);
    if (!fromBlock || !toBlock) continue;

    const fromCenter = { x: tx(fromBlock.x + fromBlock.width / 2), y: ty(fromBlock.y + fromBlock.height / 2) };
    const toCenter = { x: tx(toBlock.x + toBlock.width / 2), y: ty(toBlock.y + toBlock.height / 2) };

    // Compute control point (same logic as ConnectionArrows)
    const midX = (fromCenter.x + toCenter.x) / 2 + (conn.cpX || 0) * scale;
    const midY = (fromCenter.y + toCenter.y) / 2 + (conn.cpY || 0) * scale;
    const hasBend = conn.cpX !== undefined && conn.cpY !== undefined && (Math.abs(conn.cpX) > 2 || Math.abs(conn.cpY) > 2);

    // Edge points aim at the control point (or opposite center for straight lines)
    const aimPoint = hasBend ? { x: midX, y: midY } : toCenter;
    const aimPointReverse = hasBend ? { x: midX, y: midY } : fromCenter;
    const from = getEdgePointPdf(fromCenter, aimPoint, fromBlock);
    const to = getEdgePointPdf(toCenter, aimPointReverse, toBlock);

    // Actual connection color and width
    const connColor = parseColor(conn.color, [60, 60, 80]);
    doc.setDrawColor(connColor[0], connColor[1], connColor[2]);
    doc.setFillColor(connColor[0], connColor[1], connColor[2]);
    const connWidth = Math.max(0.5, (conn.strokeWidth ?? 2) * scale * 0.5);
    doc.setLineWidth(connWidth);

    if (conn.arrowStyle === 'dashed') doc.setLineDashPattern([4, 3], 0);
    else if (conn.arrowStyle === 'dotted') doc.setLineDashPattern([1.5, 2], 0);

    if (hasBend) {
      // Draw quadratic bezier curve using raw PDF commands
      // Convert quadratic bezier (P0, CP, P2) to cubic bezier (P0, CP1, CP2, P2)
      const cp1x = from.x + (2/3) * (midX - from.x);
      const cp1y = from.y + (2/3) * (midY - from.y);
      const cp2x = to.x + (2/3) * (midX - to.x);
      const cp2y = to.y + (2/3) * (midY - to.y);

      const internal = (doc as any).internal;
      const f = (n: number) => n.toFixed(4);
      // PDF uses bottom-left origin, so flip Y
      internal.write(`${f(from.x)} ${f(pageH - from.y)} m`);
      internal.write(`${f(cp1x)} ${f(pageH - cp1y)} ${f(cp2x)} ${f(pageH - cp2y)} ${f(to.x)} ${f(pageH - to.y)} c`);
      internal.write('S');
    } else {
      doc.line(from.x, from.y, to.x, to.y);
    }
    doc.setLineDashPattern([], 0);

    // Arrowhead — compute angle at the endpoint
    let angle: number;
    if (hasBend) {
      // Tangent at end of quadratic bezier: direction from control point to end
      angle = Math.atan2(to.y - midY, to.x - midX);
    } else {
      angle = Math.atan2(to.y - from.y, to.x - from.x);
    }
    const aLen = Math.max(6, 8 * scale);
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
