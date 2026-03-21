import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Image, FileText, FileCode } from 'lucide-react';
import { toast } from 'sonner';

interface CanvasExportProps {
  open: boolean;
  onClose: () => void;
  canvasElement: HTMLDivElement | null;
}

export default function CanvasExport({ open, onClose, canvasElement }: CanvasExportProps) {
  const [exporting, setExporting] = useState(false);

  const exportAs = useCallback(async (format: 'png' | 'pdf' | 'svg') => {
    if (!canvasElement) { toast.error('Canvas not ready'); return; }
    setExporting(true);
    try {
      const inner = canvasElement.querySelector('[data-canvas-bg]')?.parentElement as HTMLElement;
      if (!inner) throw new Error('Canvas inner not found');

      if (format === 'png') {
        const html2canvas = (await import('html2canvas')).default;
        const canvas = await html2canvas(inner, { backgroundColor: null, scale: 2, useCORS: true });
        const link = document.createElement('a');
        link.download = 'canvas-export.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        toast.success('Exported as PNG');
      } else if (format === 'pdf') {
        const html2canvas = (await import('html2canvas')).default;
        const canvas = await html2canvas(inner, { backgroundColor: '#fff', scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/png');
        const html2pdf = (await import('html2pdf.js')).default;
        const el = document.createElement('div');
        const img = document.createElement('img');
        img.src = imgData;
        img.style.width = '100%';
        el.appendChild(img);
        await html2pdf().from(el).set({
          margin: 10,
          filename: 'canvas-export.pdf',
          image: { type: 'png', quality: 0.98 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: canvas.width > canvas.height ? 'landscape' : 'portrait' },
        }).save();
        toast.success('Exported as PDF');
      } else if (format === 'svg') {
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        const w = inner.offsetWidth;
        const h = inner.offsetHeight;
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        svg.setAttribute('xmlns', svgNS);
        const bg = document.createElementNS(svgNS, 'rect');
        bg.setAttribute('width', String(w));
        bg.setAttribute('height', String(h));
        bg.setAttribute('fill', '#f5f5f5');
        svg.appendChild(bg);

        const blocks = inner.querySelectorAll('[data-block-id]');
        blocks.forEach(block => {
          const el = block as HTMLElement;
          const rect = document.createElementNS(svgNS, 'rect');
          rect.setAttribute('x', el.style.left?.replace('px', '') || '0');
          rect.setAttribute('y', el.style.top?.replace('px', '') || '0');
          rect.setAttribute('width', String(el.offsetWidth));
          rect.setAttribute('height', String(el.offsetHeight));
          rect.setAttribute('fill', '#fff');
          rect.setAttribute('stroke', '#ccc');
          rect.setAttribute('rx', '4');
          svg.appendChild(rect);
          const text = document.createElementNS(svgNS, 'text');
          text.setAttribute('x', String(parseInt(el.style.left || '0') + el.offsetWidth / 2));
          text.setAttribute('y', String(parseInt(el.style.top || '0') + el.offsetHeight / 2 + 4));
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('font-size', '12');
          text.setAttribute('fill', '#333');
          text.textContent = el.querySelector('.block-label')?.textContent || '';
          svg.appendChild(text);
        });

        const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
        const link = document.createElement('a');
        link.download = 'canvas-export.svg';
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
        toast.success('Exported as SVG');
      }
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Export failed');
    } finally {
      setExporting(false);
      onClose();
    }
  }, [canvasElement, onClose]);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Download className="h-5 w-5" /> Export Canvas</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 mt-2">
          <Button variant="outline" className="justify-start gap-3 h-12" onClick={() => exportAs('png')} disabled={exporting}>
            <Image className="h-5 w-5" /> Export as PNG
          </Button>
          <Button variant="outline" className="justify-start gap-3 h-12" onClick={() => exportAs('pdf')} disabled={exporting}>
            <FileText className="h-5 w-5" /> Export as PDF
          </Button>
          <Button variant="outline" className="justify-start gap-3 h-12" onClick={() => exportAs('svg')} disabled={exporting}>
            <FileCode className="h-5 w-5" /> Export as SVG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
