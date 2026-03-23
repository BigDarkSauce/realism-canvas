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

      // 1. Generate GraphViz .dot file for structure visualization
      const dotFile = generateDotGraph(state);
      zip.file('canvas-map.dot', dotFile);

      // 2. Generate block documents organized by group
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
 * Generate a GraphViz .dot file representing the canvas structure.
 * Open with Graphviz (dot), yEd, or VS Code Graphviz extension — no internet needed.
 */
function generateDotGraph(state: CanvasExportState): string {
  const { blocks, connections, groups } = state;
  const groupMap = new Map<string, Group>();
  groups.forEach(g => groupMap.set(g.id, g));

  const lines: string[] = [];
  lines.push('digraph CanvasMap {');
  lines.push('  rankdir=LR;');
  lines.push('  node [shape=box, style="rounded,filled", fillcolor="#f3f4f6", fontname="Helvetica", fontsize=11];');
  lines.push('  edge [fontsize=9, fontname="Helvetica"];');
  lines.push('');

  // Group subgraphs
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

  let clusterIdx = 0;
  for (const [gId, gBlocks] of grouped.entries()) {
    const group = groupMap.get(gId)!;
    lines.push(`  subgraph cluster_${clusterIdx++} {`);
    lines.push(`    label="${dotEsc(group.label)}";`);
    lines.push('    style="dashed";');
    lines.push(`    color="${group.bgColor && group.bgColor !== 'transparent' ? group.bgColor : '#94a3b8'}";`);
    for (const b of gBlocks) {
      const shape = b.shape === 'circle' ? 'ellipse' : b.shape === 'sticky' ? 'note' : 'box';
      lines.push(`    "${dotEsc(b.id)}" [label="${dotEsc(b.label)}", shape=${shape}];`);
    }
    lines.push('  }');
    lines.push('');
  }

  // Ungrouped nodes
  for (const b of ungrouped) {
    const shape = b.shape === 'circle' ? 'ellipse' : b.shape === 'sticky' ? 'note' : 'box';
    lines.push(`  "${dotEsc(b.id)}" [label="${dotEsc(b.label)}", shape=${shape}];`);
  }
  lines.push('');

  // Connections
  for (const c of connections) {
    const style = c.arrowStyle === 'dashed' ? 'dashed' : c.arrowStyle === 'dotted' ? 'dotted' : 'solid';
    const color = c.color || '#374151';
    lines.push(`  "${dotEsc(c.fromId)}" -> "${dotEsc(c.toId)}" [style=${style}, color="${color}"];`);
  }

  lines.push('}');
  return lines.join('\n');
}

function dotEsc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Generate a real PDF for a block using jsPDF.
 */
function generateBlockPdf(block: Block): Blob {
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

  return doc.output('blob');
}

function generateBlockWordDoc(block: Block): Blob {
  const notes = block.markdown || block.comment || '';
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="utf-8">
<style>body{font-family:Calibri,Arial,sans-serif;font-size:12pt;color:#1a1a2e;margin:40px;line-height:1.6;}h1{font-size:18pt;border-bottom:2px solid #6ee7b7;padding-bottom:6px;}a{color:#2563eb;}</style>
</head><body>
<h1>${esc(block.label)}</h1>
<p style="color:#888;font-size:10pt;">Shape: ${block.shape || 'rectangle'} | Size: ${block.width}×${block.height}</p>
${notes ? `<h2 style="font-size:14pt;margin-top:20px;">Notes</h2><div style="white-space:pre-wrap;">${esc(notes)}</div>` : ''}
</body></html>`;
  return new Blob(['\ufeff', html], { type: 'application/msword' });
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
      const blob = format === 'pdf' ? generateBlockPdf(block) : generateBlockWordDoc(block);
      folder.file(`${sanitize(block.label)}${ext}`, blob);
    }
  }

  if (ungrouped.length > 0) {
    const folder = zip.folder('Ungrouped')!;
    for (const block of ungrouped) {
      const blob = format === 'pdf' ? generateBlockPdf(block) : generateBlockWordDoc(block);
      folder.file(`${sanitize(block.label)}${ext}`, blob);
    }
  }
}
