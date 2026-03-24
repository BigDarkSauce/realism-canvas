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
            Export all blocks as documents organized by group, with a text structure map.
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
 * Generate a Mermaid flowchart (.md) showing blocks, groups, and connections.
 * Renderable in Obsidian, Typora, GitHub, VS Code, etc.
 */
function generateMermaidDiagram(state: CanvasExportState): string {
  const { blocks, connections, groups } = state;
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

  const mermaidId = (id: string) => id.replace(/[^a-zA-Z0-9]/g, '_');
  const shapeWrap = (id: string, label: string, shape?: string) => {
    const mid = mermaidId(id);
    const safe = label.replace(/"/g, "'");
    switch (shape) {
      case 'circle': return `${mid}(("${safe}"))`;
      case 'sticky': return `${mid}>"${safe}"]`;
      case 'text': return `${mid}["${safe}"]`;
      default: return `${mid}["${safe}"]`;
    }
  };

  const lines: string[] = [
    '# Canvas Structure Map\n',
    '```mermaid',
    'flowchart TD',
  ];

  for (const [gId, gBlocks] of grouped.entries()) {
    const group = groupMap.get(gId)!;
    lines.push(`  subgraph ${mermaidId(gId)}["${group.label.replace(/"/g, "'")}"]`);
    for (const b of gBlocks) {
      lines.push(`    ${shapeWrap(b.id, b.label, b.shape)}`);
    }
    lines.push('  end');
  }

  for (const b of ungrouped) {
    lines.push(`  ${shapeWrap(b.id, b.label, b.shape)}`);
  }

  for (const c of connections) {
    const from = mermaidId(c.fromId);
    const to = mermaidId(c.toId);
    const arrow = c.arrowStyle === 'dashed' ? '-.->' : c.arrowStyle === 'dotted' ? '-.->' : '-->';
    lines.push(`  ${from} ${arrow} ${to}`);
  }

  lines.push('```');
  lines.push(`\n---\n**Summary:** ${blocks.length} blocks, ${groups.length} groups, ${connections.length} connections`);

  return lines.join('\n');
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
