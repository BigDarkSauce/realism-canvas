import { useState } from 'react';
import { Block, Connection, Group, DrawingStroke, CanvasBackground } from '@/types/canvas';
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
  strokes: DrawingStroke[];
  background: CanvasBackground;
  backgroundImage: string | null;
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

      // 1. Generate visual canvas map PDF (non-clickable visual reference)
      const mapPdf = await generateCanvasMapPdf(state, format);
      zip.file('canvas-map.pdf', mapPdf, { binary: true });

      // 2. Generate clickable PPTX map with hyperlinks to exported files
      const mapPptx = await generateCanvasMapPptx(state, format);
      zip.file('canvas-map.pptx', mapPptx, { binary: true });

      // 2. Generate block documents organized by group
      generateBlockDocuments(state, zip, format);

      // 3. Download ZIP
      const zipData = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      saveAs(zipData, `${sanitize(title)}.zip`);
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
            Export all blocks as documents organized by group, with a clickable PPTX canvas map
            and a visual PDF reference. Click blocks in the PPTX map to open their files.
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

// ─── Utilities ──────────────────────────────────────────────

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9 _-]/g, '_').trim() || 'export';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseColor(color: string | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!color) return fallback;
  const s = color.trim();
  const hexMatch = s.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    if (hex.length >= 6) return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
  }
  const rgbMatch = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) return [+rgbMatch[1], +rgbMatch[2], +rgbMatch[3]];
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
  return n;
}

// ─── DOCX Canvas Map (clickable hyperlinks to files) ────────

function hexFromRgb(r: number, g: number, b: number): string {
  return [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function generateCanvasMapPptx(state: CanvasExportState, exportFormat: ExportFormat): Promise<Uint8Array> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const { blocks, connections, groups } = state;
  const ext = exportFormat === 'pdf' ? '.pdf' : '.doc';

  const groupMap = new Map<string, Group>();
  groups.forEach(g => groupMap.set(g.id, g));
  const blockMap = new Map<string, Block>();
  blocks.forEach(b => blockMap.set(b.id, b));

  if (blocks.length === 0) {
    const pptx = new PptxGenJS();
    const slide = pptx.addSlide();
    slide.addText('Canvas Map — No blocks', { x: 1, y: 2, w: 8, h: 1, fontSize: 24, color: '333333' });
    const data = await pptx.write({ outputType: 'arraybuffer' }) as ArrayBuffer;
    return new Uint8Array(data);
  }

  // Compute bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of blocks) {
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
  }
  for (const group of groups) {
    const gBlocks = blocks.filter(b => b.groupId === group.id);
    if (gBlocks.length === 0) continue;
    for (const b of gBlocks) minY = Math.min(minY, b.y - 50);
  }

  const padding = 40;
  const contentW = maxX - minX + padding * 2;
  const contentH = maxY - minY + padding * 2;

  // Slide dimensions in inches (widescreen 13.33 x 7.5)
  const slideW = 13.333;
  const slideH = 7.5;
  const margin = 0.4;
  const availW = slideW - margin * 2;
  const availH = slideH - margin * 2;

  // Scale + multi-page tiling
  const singlePageScale = Math.min(availW / contentW, availH / contentH);
  const avgBlockW = blocks.reduce((s, b) => s + b.width, 0) / blocks.length;
  const minBlockInches = 0.6;
  const minScale = minBlockInches / avgBlockW;
  const scale = Math.max(singlePageScale, minScale, 0.002);
  const isSinglePage = contentW * scale <= availW && contentH * scale <= availH;
  const tilesX = isSinglePage ? 1 : Math.ceil((contentW * scale) / availW);
  const tilesY = isSinglePage ? 1 : Math.ceil((contentH * scale) / availH);

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';

  const rgbHex = (c: [number, number, number]) => hexFromRgb(c[0], c[1], c[2]);

  for (let tileY = 0; tileY < tilesY; tileY++) {
    for (let tileX = 0; tileX < tilesX; tileX++) {
      const slide = pptx.addSlide();
      slide.background = { color: 'FCFCFE' };

      const vpLeft = minX - padding + (tileX * availW) / scale;
      const vpTop = minY - padding + (tileY * availH) / scale;

      const tx = (x: number) => margin + (x - vpLeft) * scale;
      const ty = (y: number) => margin + (y - vpTop) * scale;

      // Draw group rectangles
      for (const group of groups) {
        const gBlocks = blocks.filter(b => b.groupId === group.id);
        if (gBlocks.length === 0) continue;
        let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
        for (const b of gBlocks) {
          gMinX = Math.min(gMinX, b.x); gMinY = Math.min(gMinY, b.y);
          gMaxX = Math.max(gMaxX, b.x + b.width); gMaxY = Math.max(gMaxY, b.y + b.height);
        }
        const gPad = 20;
        const gx = tx(gMinX - gPad);
        const gy = ty(gMinY - gPad) - 0.3;
        const gw = (gMaxX - gMinX + gPad * 2) * scale;
        const gh = (gMaxY - gMinY + gPad * 2) * scale + 0.3;
        if (gx + gw < 0 || gx > slideW || gy + gh < 0 || gy > slideH) continue;

        const isTransparent = !group.bgColor || group.bgColor === 'transparent';
        const groupBg = parseColor(isTransparent ? undefined : group.bgColor, [100, 149, 237]);
        const fillHex = isTransparent ? undefined : rgbHex([
          Math.min(255, groupBg[0] + Math.round((255 - groupBg[0]) * 0.88)),
          Math.min(255, groupBg[1] + Math.round((255 - groupBg[1]) * 0.88)),
          Math.min(255, groupBg[2] + Math.round((255 - groupBg[2]) * 0.88)),
        ]);

        slide.addShape(pptx.ShapeType.roundRect, {
          x: gx, y: gy, w: gw, h: gh,
          rectRadius: 0.1,
          fill: fillHex ? { color: fillHex } : undefined,
          line: { color: isTransparent ? '9696AA' : rgbHex(groupBg), width: 1.5, dashType: 'dash' },
        });

        // Group label
        const labelFontSize = Math.max(7, Math.min(14, 10 * scale * 100));
        slide.addText(group.label, {
          x: gx + 0.1, y: gy + 0.05, w: gw - 0.2, h: 0.25,
          fontSize: labelFontSize, bold: true, fontFace: 'Arial',
          color: isTransparent ? '505064' : rgbHex(groupBg),
          align: 'center',
        });
      }

      // Draw blocks as shapes with hyperlinks
      for (const b of blocks) {
        const bx = tx(b.x);
        const by = ty(b.y);
        const bw = b.width * scale;
        const bh = b.height * scale;
        if (bx + bw < 0 || bx > slideW || by + bh < 0 || by > slideH) continue;

        const bgCol = parseColor(b.bgColor, b.shape === 'sticky' ? [255, 249, 196] : [245, 245, 250]);
        const borderCol = parseColor(b.borderColor, [80, 80, 100]);
        const textCol = parseColor(b.textColor, [20, 20, 40]);

        const group = b.groupId ? groupMap.get(b.groupId) : undefined;
        const folderName = group ? sanitize(group.label) : 'Ungrouped';
        const fileName = `${sanitize(b.label)}${ext}`;
        const relPath = `./${folderName}/${fileName}`;

        const shapeType = b.shape === 'circle'
          ? pptx.ShapeType.roundRect
          : b.shape === 'sticky' ? pptx.ShapeType.rect
          : pptx.ShapeType.roundRect;

        const cornerRadius = b.shape === 'circle'
          ? Math.min(bw, bh) / 2
          : b.shape === 'sticky' ? 0 : 0.08;

        const fontSize = Math.max(6, Math.min(parseFontSize(b.fontSize, 10), 14) * scale * 80);

        slide.addText(b.label, {
          shape: shapeType,
          x: bx, y: by, w: bw, h: bh,
          rectRadius: cornerRadius,
          fill: { color: rgbHex(bgCol) },
          line: {
            color: rgbHex(borderCol), width: 1,
            dashType: b.borderStyle === 'dashed' ? 'dash' : b.borderStyle === 'dotted' ? 'sysDot' : 'solid',
          },
          fontSize, fontFace: 'Arial', color: rgbHex(textCol),
          align: 'center', valign: 'middle',
          hyperlink: { url: relPath, tooltip: `Open ${fileName}` },
          rotate: b.rotation ?? 0,
        });
      }

      // Draw connections as lines
      for (const conn of connections) {
        const fromBlock = blockMap.get(conn.fromId);
        const toBlock = blockMap.get(conn.toId);
        if (!fromBlock || !toBlock) continue;

        const fx = tx(fromBlock.x + fromBlock.width / 2);
        const fy = ty(fromBlock.y + fromBlock.height / 2);
        const toX = tx(toBlock.x + toBlock.width / 2);
        const toY = ty(toBlock.y + toBlock.height / 2);

        const connColor = parseColor(conn.color, [60, 60, 80]);
        const lx = Math.min(fx, toX);
        const ly = Math.min(fy, toY);
        const lw = Math.abs(toX - fx) || 0.01;
        const lh = Math.abs(toY - fy) || 0.01;

        const flipH = toX < fx;
        const flipV = toY < fy;

        slide.addShape(pptx.ShapeType.line, {
          x: lx, y: ly, w: lw, h: lh,
          flipH, flipV,
          line: {
            color: rgbHex(connColor),
            width: Math.max(0.5, (conn.strokeWidth ?? 2) * scale * 40),
            dashType: conn.arrowStyle === 'dashed' ? 'dash' : conn.arrowStyle === 'dotted' ? 'sysDot' : 'solid',
            endArrowType: 'triangle',
          },
        });
      }

      // Page label
      if (tilesX * tilesY > 1) {
        slide.addText(`Page ${tileY * tilesX + tileX + 1}/${tilesX * tilesY}`, {
          x: slideW - 2, y: slideH - 0.4, w: 1.8, h: 0.3,
          fontSize: 8, color: '999999', align: 'right', fontFace: 'Arial',
        });
      }
    }
  }

  const data = await pptx.write({ outputType: 'arraybuffer' }) as ArrayBuffer;
  return new Uint8Array(data);
}

// ─── Canvas Map PDF (multi-page tiled, visual reference) ─────

async function generateCanvasMapPdf(state: CanvasExportState, exportFormat: ExportFormat = 'pdf'): Promise<Uint8Array> {
  const { blocks, connections, groups, strokes, background, backgroundImage } = state;
  if (blocks.length === 0) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(16);
    doc.text('Canvas Map - No blocks', 40, 40);
    return new Uint8Array(doc.output('arraybuffer'));
  }

  // Compute bounding box including strokes
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of blocks) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  for (const group of groups) {
    const gBlocks = blocks.filter(b => b.groupId === group.id);
    if (gBlocks.length === 0) continue;
    for (const b of gBlocks) {
      minY = Math.min(minY, b.y - 40);
    }
  }
  for (const stroke of strokes) {
    for (const pt of stroke.points) {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    }
  }

  const padding = 40;
  const contentW = maxX - minX + padding * 2;
  const contentH = maxY - minY + padding * 2;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 30;
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2;

  const singlePageScale = Math.min(availW / contentW, availH / contentH);
  const minBlockSize = 35;
  const avgBlockW = blocks.reduce((s, b) => s + b.width, 0) / blocks.length;
  const minScale = minBlockSize / avgBlockW;
  const scale = Math.max(singlePageScale, minScale, 0.15);
  const isSinglePage = contentW * scale <= availW && contentH * scale <= availH;

  const tilesX = isSinglePage ? 1 : Math.ceil((contentW * scale) / availW);
  const tilesY = isSinglePage ? 1 : Math.ceil((contentH * scale) / availH);
  const totalMapPages = tilesX * tilesY;

  // Try to load background image if present
  let bgImgData: string | null = null;
  if (background === 'image' && backgroundImage) {
    try {
      const resp = await fetch(backgroundImage);
      const blob = await resp.blob();
      bgImgData = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch { /* ignore */ }
  }

  const groupMap = new Map<string, Group>();
  groups.forEach(g => groupMap.set(g.id, g));
  const blockMap = new Map<string, Block>();
  blocks.forEach(b => blockMap.set(b.id, b));

  // Collect block link rects to add file links after drawing
  interface BlockLinkInfo { blockId: string; mapPage: number; x: number; y: number; w: number; h: number; }
  const blockLinks: BlockLinkInfo[] = [];

  for (let tileY = 0; tileY < tilesY; tileY++) {
    for (let tileX = 0; tileX < tilesX; tileX++) {
      if (tileX > 0 || tileY > 0) doc.addPage();
      const currentMapPage = tileY * tilesX + tileX + 1; // 1-indexed

      const vpLeft = minX - padding + (tileX * availW) / scale;
      const vpTop = minY - padding + (tileY * availH) / scale;
      const vpRight = vpLeft + availW / scale;
      const vpBottom = vpTop + availH / scale;

      const tx = (x: number) => margin + (x - vpLeft) * scale;
      const ty = (y: number) => margin + (y - vpTop) * scale;

      doc.saveGraphicsState();
      doc.rect(margin, margin, availW, availH);
      (doc as any).internal.write('W n');

      // Background
      drawBackground(doc, background, bgImgData, margin, margin, availW, availH, scale);

      // Drawing strokes
      for (const stroke of strokes) {
        if (stroke.points.length < 2) continue;
        const strokeMinX = Math.min(...stroke.points.map(p => p.x));
        const strokeMaxX = Math.max(...stroke.points.map(p => p.x));
        const strokeMinY = Math.min(...stroke.points.map(p => p.y));
        const strokeMaxY = Math.max(...stroke.points.map(p => p.y));
        if (strokeMaxX < vpLeft || strokeMinX > vpRight || strokeMaxY < vpTop || strokeMinY > vpBottom) continue;

        const col = parseColor(stroke.color, [0, 0, 0]);
        doc.setDrawColor(col[0], col[1], col[2]);
        doc.setLineWidth(Math.max(0.5, stroke.width * scale));
        doc.setLineDashPattern([], 0);
        const pts = stroke.points;
        for (let i = 0; i < pts.length - 1; i++) {
          doc.line(tx(pts[i].x), ty(pts[i].y), tx(pts[i+1].x), ty(pts[i+1].y));
        }
      }

      // Group rects
      interface GroupRect { group: Group; rx: number; ry: number; rw: number; rh: number; isTransparent: boolean; groupBg: [number,number,number]; }
      const groupRects: GroupRect[] = [];
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
        if (gMaxX < vpLeft || gMinX > vpRight || gMaxY < vpTop || gMinY > vpBottom) continue;
        const gPad = 20;
        const labelScale = group.labelScale ?? 1;
        const groupFontSize = parseFontSize(group.fontSize, 10) * scale * labelScale;
        const labelAreaH = groupFontSize + 16;
        const rx = tx(gMinX - gPad);
        const ry = ty(gMinY - gPad) - labelAreaH;
        const rw = (gMaxX - gMinX + gPad * 2) * scale;
        const rh = (gMaxY - gMinY + gPad * 2) * scale + labelAreaH;
        const isTransparent = !group.bgColor || group.bgColor === 'transparent';
        const groupBg = parseColor(isTransparent ? undefined : group.bgColor, [100, 149, 237]);
        groupRects.push({ group, rx, ry, rw, rh, isTransparent, groupBg });
      }

      // Draw group fills with overlap clipping
      for (let gi = 0; gi < groupRects.length; gi++) {
        const { group, rx, ry, rw, rh, isTransparent, groupBg } = groupRects[gi];
        if (!isTransparent) {
          doc.saveGraphicsState();
          const internal = (doc as any).internal;
          const f = (n: number) => n.toFixed(4);
          internal.write(`${f(rx)} ${f(pageH - ry)} m`);
          internal.write(`${f(rx + rw)} ${f(pageH - ry)} l`);
          internal.write(`${f(rx + rw)} ${f(pageH - (ry + rh))} l`);
          internal.write(`${f(rx)} ${f(pageH - (ry + rh))} l`);
          internal.write('h');
          for (let gj = 0; gj < groupRects.length; gj++) {
            if (gi === gj) continue;
            const other = groupRects[gj];
            const ox1 = Math.max(rx, other.rx);
            const oy1 = Math.max(ry, other.ry);
            const ox2 = Math.min(rx + rw, other.rx + other.rw);
            const oy2 = Math.min(ry + rh, other.ry + other.rh);
            if (ox1 < ox2 && oy1 < oy2) {
              const inset = 2;
              internal.write(`${f(ox1 + inset)} ${f(pageH - (oy1 + inset))} m`);
              internal.write(`${f(ox1 + inset)} ${f(pageH - (oy2 - inset))} l`);
              internal.write(`${f(ox2 - inset)} ${f(pageH - (oy2 - inset))} l`);
              internal.write(`${f(ox2 - inset)} ${f(pageH - (oy1 + inset))} l`);
              internal.write('h');
            }
          }
          internal.write('W n');
          doc.setFillColor(
            Math.min(255, groupBg[0] + Math.round((255 - groupBg[0]) * 0.88)),
            Math.min(255, groupBg[1] + Math.round((255 - groupBg[1]) * 0.88)),
            Math.min(255, groupBg[2] + Math.round((255 - groupBg[2]) * 0.88))
          );
          doc.rect(rx, ry, rw, rh, 'F');
          doc.restoreGraphicsState();
        }

        const borderCol = isTransparent ? [150, 150, 170] as [number,number,number] : groupBg;
        doc.setDrawColor(borderCol[0], borderCol[1], borderCol[2]);
        doc.setLineWidth(1.5);
        doc.setLineDashPattern([4, 3], 0);
        doc.roundedRect(rx, ry, rw, rh, 6, 6, 'S');
        doc.setLineDashPattern([], 0);

        // Group label
        const labelScale2 = group.labelScale ?? 1;
        const groupFontSize = parseFontSize(group.fontSize, 10) * scale * labelScale2;
        const fontSize = Math.max(6, groupFontSize);
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', 'bold');
        const txtColor = parseColor(group.textColor, isTransparent ? [80,80,100] : [groupBg[0], groupBg[1], groupBg[2]]);
        const labelX = rx + rw / 2 + (group.labelOffsetX ?? 0) * scale;
        const labelY = ry + fontSize + 6;
        const labelW = doc.getTextWidth(group.label) + 14;
        const labelH = fontSize + 10;
        doc.setDrawColor(borderCol[0], borderCol[1], borderCol[2]);
        doc.setFillColor(255, 255, 255);
        doc.setLineWidth(1.2);
        doc.roundedRect(labelX - labelW / 2, labelY - fontSize * 0.75 - 4, labelW, labelH, 3, 3, 'FD');
        doc.setTextColor(txtColor[0], txtColor[1], txtColor[2]);
        doc.text(group.label, labelX, labelY, { align: 'center' });
      }

      // Blocks
      for (const b of blocks) {
        if (b.x + b.width < vpLeft || b.x > vpRight || b.y + b.height < vpTop || b.y > vpBottom) continue;
        const bx = tx(b.x);
        const by = ty(b.y);
        const bw = b.width * scale;
        const bh = b.height * scale;
        const bgCol = parseColor(b.bgColor, b.shape === 'sticky' ? [255, 249, 196] : [245, 245, 250]);
        const borderCol = parseColor(b.borderColor, [80, 80, 100]);
        const textCol = parseColor(b.textColor, [20, 20, 40]);
        doc.setFillColor(bgCol[0], bgCol[1], bgCol[2]);
        doc.setDrawColor(borderCol[0], borderCol[1], borderCol[2]);
        doc.setLineWidth(1);
        if (b.borderStyle === 'dashed') doc.setLineDashPattern([4, 3], 0);
        else if (b.borderStyle === 'dotted') doc.setLineDashPattern([1.5, 2], 0);
        else doc.setLineDashPattern([], 0);

        const rotation = b.rotation ?? 0;
        const cx = bx + bw / 2;
        const cy = by + bh / 2;
        const needsRotation = Math.abs(rotation) > 0.5;
        const cornerR = b.shape === 'circle'
          ? Math.min(bw, bh) / 2
          : b.shape === 'sticky' ? 2 : Math.min(8 * scale, Math.min(bw, bh) / 3);

        if (needsRotation) {
          doc.saveGraphicsState();
          const rad = (rotation * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const internal = (doc as any).internal;
          const f2 = (n: number) => n.toFixed(4);
          internal.write(`${f2(cos)} ${f2(sin)} ${f2(-sin)} ${f2(cos)} ${f2(cx)} ${f2(pageH - cy)} cm`);
          doc.roundedRect(-bw / 2, -bh / 2, bw, bh, cornerR, cornerR, 'FD');
          if (b.shape === 'sticky') {
            const foldSize = 10 * scale;
            doc.setFillColor(Math.max(0, bgCol[0] - 30), Math.max(0, bgCol[1] - 30), Math.max(0, bgCol[2] - 30));
            doc.triangle(bw / 2 - foldSize, -bh / 2, bw / 2, -bh / 2, bw / 2, -bh / 2 + foldSize, 'F');
          }
          const fSize = Math.max(5, Math.min(parseFontSize(b.fontSize, 10), 14) * scale);
          doc.setFontSize(fSize);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(textCol[0], textCol[1], textCol[2]);
          const labelLines = doc.splitTextToSize(b.label, bw - 8);
          const textStartY = -(labelLines.length - 1) * (fSize * 0.6);
          for (let i = 0; i < Math.min(labelLines.length, 4); i++) {
            doc.text(labelLines[i], 0, textStartY + i * (fSize * 1.2), { align: 'center' });
          }
          doc.restoreGraphicsState();
        } else {
          doc.roundedRect(bx, by, bw, bh, cornerR, cornerR, 'FD');
          if (b.shape === 'sticky') {
            const foldSize = 10 * scale;
            doc.setFillColor(Math.max(0, bgCol[0] - 30), Math.max(0, bgCol[1] - 30), Math.max(0, bgCol[2] - 30));
            doc.triangle(bx + bw - foldSize, by, bx + bw, by, bx + bw, by + foldSize, 'F');
          }
          const fSize = Math.max(5, Math.min(parseFontSize(b.fontSize, 10), 14) * scale);
          doc.setFontSize(fSize);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(textCol[0], textCol[1], textCol[2]);
          const labelLines = doc.splitTextToSize(b.label, bw - 8);
          const textStartY = by + bh / 2 - (labelLines.length - 1) * (fSize * 0.6);
          for (let i = 0; i < Math.min(labelLines.length, 4); i++) {
            doc.text(labelLines[i], cx, textStartY + i * (fSize * 1.2), { align: 'center' });
          }
        }
        doc.setLineDashPattern([], 0);

        // Record link rect for later (we'll add internal links after appending detail pages)
        const linkX = needsRotation ? cx - bw / 2 : bx;
        const linkY = needsRotation ? cy - bh / 2 : by;
        blockLinks.push({ blockId: b.id, mapPage: currentMapPage, x: linkX, y: linkY, w: bw, h: bh });
      }

      // Connections
      const getEdgePointPdf = (fromPt: {x:number,y:number}, toPt: {x:number,y:number}, block: Block) => {
        const bcx = tx(block.x + block.width / 2);
        const bcy = ty(block.y + block.height / 2);
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
          px = bcx + sign * hw;
          py = bcy + sign * hw * Math.tan(angle);
        } else {
          const sign = Math.sin(angle) > 0 ? 1 : -1;
          px = bcx + sign * hh / Math.tan(angle);
          py = bcy + sign * hh;
        }
        return { x: px, y: py };
      };

      for (const conn of connections) {
        const fromBlock = blockMap.get(conn.fromId);
        const toBlock = blockMap.get(conn.toId);
        if (!fromBlock || !toBlock) continue;
        const fCenterX = fromBlock.x + fromBlock.width / 2;
        const fCenterY = fromBlock.y + fromBlock.height / 2;
        const tCenterX = toBlock.x + toBlock.width / 2;
        const tCenterY = toBlock.y + toBlock.height / 2;
        const connMinX = Math.min(fCenterX, tCenterX) - 100;
        const connMaxX = Math.max(fCenterX, tCenterX) + 100;
        const connMinY = Math.min(fCenterY, tCenterY) - 100;
        const connMaxY = Math.max(fCenterY, tCenterY) + 100;
        if (connMaxX < vpLeft || connMinX > vpRight || connMaxY < vpTop || connMinY > vpBottom) continue;

        const fromCenter = { x: tx(fCenterX), y: ty(fCenterY) };
        const toCenter = { x: tx(tCenterX), y: ty(tCenterY) };
        const midX = (fromCenter.x + toCenter.x) / 2 + (conn.cpX || 0) * scale;
        const midY = (fromCenter.y + toCenter.y) / 2 + (conn.cpY || 0) * scale;
        const hasBend = conn.cpX !== undefined && conn.cpY !== undefined && (Math.abs(conn.cpX) > 2 || Math.abs(conn.cpY) > 2);
        const aimPoint = hasBend ? { x: midX, y: midY } : toCenter;
        const aimPointReverse = hasBend ? { x: midX, y: midY } : fromCenter;
        const from = getEdgePointPdf(fromCenter, aimPoint, fromBlock);
        const to = getEdgePointPdf(toCenter, aimPointReverse, toBlock);
        const connColor = parseColor(conn.color, [60, 60, 80]);
        doc.setDrawColor(connColor[0], connColor[1], connColor[2]);
        doc.setFillColor(connColor[0], connColor[1], connColor[2]);
        const connWidth = Math.max(0.5, (conn.strokeWidth ?? 2) * scale * 0.5);
        doc.setLineWidth(connWidth);
        if (conn.arrowStyle === 'dashed') doc.setLineDashPattern([4, 3], 0);
        else if (conn.arrowStyle === 'dotted') doc.setLineDashPattern([1.5, 2], 0);
        else doc.setLineDashPattern([], 0);

        if (hasBend) {
          const cp1x = from.x + (2/3) * (midX - from.x);
          const cp1y = from.y + (2/3) * (midY - from.y);
          const cp2x = to.x + (2/3) * (midX - to.x);
          const cp2y = to.y + (2/3) * (midY - to.y);
          const internal = (doc as any).internal;
          const f = (n: number) => n.toFixed(4);
          internal.write(`${f(from.x)} ${f(pageH - from.y)} m`);
          internal.write(`${f(cp1x)} ${f(pageH - cp1y)} ${f(cp2x)} ${f(pageH - cp2y)} ${f(to.x)} ${f(pageH - to.y)} c`);
          internal.write('S');
        } else {
          doc.line(from.x, from.y, to.x, to.y);
        }
        doc.setLineDashPattern([], 0);

        let angle: number;
        if (hasBend) {
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

      doc.restoreGraphicsState(); // end clip

      if (totalMapPages > 1) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${currentMapPage}/${totalMapPages} (${tileX + 1},${tileY + 1})`, margin, pageH - 10);
      }
    }
  }

  // ── Add relative file URL links on map blocks (opens Word/PDF from extracted ZIP) ──
  const ext = exportFormat === 'pdf' ? '.pdf' : '.doc';
  for (const link of blockLinks) {
    const b = blockMap.get(link.blockId);
    if (!b) continue;
    const group = b.groupId ? groupMap.get(b.groupId) : undefined;
    const folderName = group ? sanitize(group.label) : 'Ungrouped';
    const fileName = `${sanitize(b.label)}${ext}`;
    const relPath = `${folderName}/${fileName}`;
    doc.setPage(link.mapPage);
    doc.link(link.x, link.y, link.w, link.h, { url: relPath });
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

function drawBackground(
  doc: jsPDF, bg: CanvasBackground, bgImgData: string | null,
  x: number, y: number, w: number, h: number, scale: number
) {
  // Fill the ENTIRE page first to eliminate any white gaps
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  if (bg === 'image' && bgImgData) {
    try {
      doc.addImage(bgImgData, 'JPEG', 0, 0, pageW, pageH);
    } catch { /* fallback to white */ }
    return;
  }
  if (bg === 'blueprint') {
    doc.setFillColor(17, 42, 75);
    doc.rect(0, 0, pageW, pageH, 'F');
    const step = 20 * scale;
    doc.setDrawColor(30, 70, 120);
    doc.setLineWidth(0.3);
    for (let gx = x; gx <= x + w; gx += step) doc.line(gx, y, gx, y + h);
    for (let gy = y; gy <= y + h; gy += step) doc.line(x, gy, x + w, gy);
  } else if (bg === 'grid') {
    doc.setFillColor(250, 250, 252);
    doc.rect(0, 0, pageW, pageH, 'F');
    const step = 20 * scale;
    doc.setDrawColor(230, 230, 235);
    doc.setLineWidth(0.2);
    for (let gx = x; gx <= x + w; gx += step) doc.line(gx, y, gx, y + h);
    for (let gy = y; gy <= y + h; gy += step) doc.line(x, gy, x + w, gy);
  } else if (bg === 'dots') {
    doc.setFillColor(250, 250, 252);
    doc.rect(0, 0, pageW, pageH, 'F');
    const step = 20 * scale;
    doc.setFillColor(210, 210, 215);
    for (let gx = x; gx <= x + w; gx += step) {
      for (let gy = y; gy <= y + h; gy += step) {
        doc.circle(gx, gy, 0.6, 'F');
      }
    }
  } else {
    doc.setFillColor(252, 252, 254);
    doc.rect(0, 0, pageW, pageH, 'F');
  }
}

// ─── Block Document Generators (for ZIP files) ─────────────

function generateBlockPdf(block: Block): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const m = 50;
  const maxWidth = pageWidth - m * 2;
  let y = m;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  const titleLines = doc.splitTextToSize(block.label, maxWidth);
  doc.text(titleLines, m, y);
  y += titleLines.length * 22 + 8;

  doc.setDrawColor(110, 231, 183);
  doc.setLineWidth(2);
  doc.line(m, y, pageWidth - m, y);
  y += 16;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(`Shape: ${block.shape || 'rectangle'}  |  Size: ${block.width}×${block.height}`, m, y);
  y += 20;

  const notes = block.markdown || block.comment || '';
  if (notes) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(45, 55, 72);
    doc.text('Notes', m, y);
    y += 18;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    const noteLines = doc.splitTextToSize(notes, maxWidth);
    const pageHeight = doc.internal.pageSize.getHeight();
    for (const line of noteLines) {
      if (y > pageHeight - m) { doc.addPage(); y = m; }
      doc.text(line, m, y);
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
