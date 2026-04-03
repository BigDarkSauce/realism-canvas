import { useState, useCallback } from 'react';
import { Block, Group } from '@/types/canvas';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Download, Loader2, FileText, File } from 'lucide-react';
import { toast } from 'sonner';
import { extractStoragePath, getSignedUrl } from '@/lib/storage';
import {
  renderHtmlToDocxBytes,
  sanitizeDocumentName,
  downloadBytesAsFile,
} from '@/lib/documentExport';

interface GroupDownloadDialogProps {
  open: boolean;
  onClose: () => void;
  group: Group;
  blocks: Block[];
}

type ExportFormat = 'pdf' | 'word';

interface BlockSourceFile {
  bytes: Uint8Array;
  contentType: string;
  ext: string;
  fileName: string;
  html: string | null;
  text: string | null;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function extractTopHeading(html: string): string | null {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const heading = doc.querySelector('h1, h2, h3, h4, h5, h6, .section-heading');
    const text = heading?.textContent?.trim();
    return text && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

function getFileExtension(nameOrUrl?: string | null): string {
  if (!nameOrUrl) return '';
  const clean = nameOrUrl.split('?')[0].split('#')[0];
  return clean.split('.').pop()?.toLowerCase() || '';
}

function isHtmlLike(contentType: string, ext: string): boolean {
  return ['html', 'htm'].includes(ext) || /html/i.test(contentType);
}

function isTextLike(contentType: string, ext: string): boolean {
  return isHtmlLike(contentType, ext) || contentType.startsWith('text/') || ['txt', 'md', 'csv', 'json', 'xml'].includes(ext);
}

async function fetchBlockSourceFile(block: Block): Promise<BlockSourceFile | null> {
  const originalUrl = block.fileStorageUrl || block.fileUrl;
  if (!originalUrl) return null;

  const storagePath = extractStoragePath(originalUrl);
  const fetchUrl = storagePath ? await getSignedUrl(storagePath) : originalUrl;
  const response = await fetch(fetchUrl);
  if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);

  const contentType = response.headers.get('content-type')?.split(';')[0] || '';
  const bytes = new Uint8Array(await response.arrayBuffer());
  const fileName = block.fileName || storagePath?.split('/').pop() || sanitizeDocumentName(block.label);
  const ext = getFileExtension(fileName || fetchUrl);
  const text = isTextLike(contentType, ext) ? new TextDecoder().decode(bytes) : null;

  return {
    bytes, contentType, ext, fileName,
    html: text && isHtmlLike(contentType, ext) ? text : null,
    text,
  };
}

function createViewerHtml(block: Block, source: BlockSourceFile | null): string {
  const notes = block.markdown || block.comment || '';
  const sourceName = source?.fileName || block.fileName || 'Attached file';

  if (source?.html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(
      /<html[\s>]/i.test(source.html)
        ? source.html
        : `<!DOCTYPE html><html><head></head><body>${source.html}</body></html>`,
      'text/html'
    );
    if (!doc.querySelector('meta[charset]')) {
      const meta = doc.createElement('meta');
      meta.setAttribute('charset', 'utf-8');
      doc.head.prepend(meta);
    }
    doc.getElementById('__viewer-theme')?.remove();
    doc.querySelectorAll('script, noscript, link[rel="preload"], link[rel="modulepreload"]').forEach(n => n.remove());
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  }

  const content = source?.text
    ? `<pre style="white-space:pre-wrap;font-family:Calibri,Arial,sans-serif;">${esc(source.text)}</pre>`
    : source
      ? `<p>Exported from <strong>${esc(sourceName)}</strong>.</p>`
      : '<p>No attached file found.</p>';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(block.label)}</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:12pt;color:#1a1a2e;margin:40px;line-height:1.6}
h1{font-size:18pt;margin:0 0 10px}h2{font-size:14pt;margin:24px 0 10px}p,pre{margin:0 0 12px}pre{overflow-wrap:anywhere}</style>
</head><body><h1>${esc(block.label)}</h1>
${notes ? `<h2>Notes</h2><div style="white-space:pre-wrap;">${esc(notes)}</div>` : ''}
<h2>Document Content</h2>${content}</body></html>`;
}

function printHtmlAsPdf(html: string, label: string): Promise<void> {
  return new Promise((resolve) => {
    const printIframe = document.createElement('iframe');
    printIframe.style.position = 'fixed';
    printIframe.style.top = '0';
    printIframe.style.left = '0';
    printIframe.style.width = '100%';
    printIframe.style.height = '100%';
    printIframe.style.opacity = '0';
    printIframe.style.pointerEvents = 'none';
    printIframe.style.zIndex = '-1';

    const printHtml = html.replace(
      '</head>',
      `<style>
        @media print {
          @page { margin: 0.6in; }
          html, body { background: #fff !important; color: #000 !important; }
          body { font-family: Calibri, Arial, sans-serif; font-size: 12pt; line-height: 1.5; }
          img { max-width: 100% !important; height: auto !important; break-inside: avoid; }
          table, figure, pre, blockquote { break-inside: avoid; }
          .math-expression, [class*="ML__"] { font-family: 'Cambria Math', Cambria, serif !important; }
        }
      </style></head>`
    );

    printIframe.srcdoc = printHtml;
    document.body.appendChild(printIframe);

    printIframe.onload = () => {
      setTimeout(() => {
        try {
          printIframe.contentWindow?.print();
        } catch (err) {
          console.error('Print failed for', label, err);
          toast.error(`Print failed for "${label}"`);
        }
        setTimeout(() => {
          try { document.body.removeChild(printIframe); } catch {}
          resolve();
        }, 1000);
      }, 500);
    };
  });
}

async function exportSingleBlockAsDocx(
  block: Block,
): Promise<{ data: Uint8Array; fileName: string; mimeType: string }> {
  let source: BlockSourceFile | null = null;
  try {
    source = await fetchBlockSourceFile(block);
  } catch (err) {
    console.warn('Failed to fetch block source:', block.label, err);
  }

  const html = createViewerHtml(block, source);
  const headingName = extractTopHeading(html) || block.label;
  const safeName = sanitizeDocumentName(headingName);

  if (source?.ext === 'docx') {
    return {
      data: source.bytes,
      fileName: `${safeName}.docx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }

  const data = await renderHtmlToDocxBytes(html);
  return {
    data,
    fileName: `${safeName}.docx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
}

export default function GroupDownloadDialog({ open, onClose, group, blocks }: GroupDownloadDialogProps) {
  const groupBlocks = blocks.filter(b => b.groupId === group.id);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(groupBlocks.map(b => b.id)));
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState('');

  const toggleBlock = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === groupBlocks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(groupBlocks.map(b => b.id)));
    }
  };

  const handleDownloadClick = () => {
    if (selected.size === 0) {
      toast.error('Select at least one file to download');
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmExport = useCallback(async () => {
    setConfirmOpen(false);
    setExporting(true);
    setProgress(0);

    const selectedBlocks = groupBlocks.filter(b => selected.has(b.id));
    const total = selectedBlocks.length;
    let done = 0;

    try {
      if (format === 'pdf') {
        // Use browser native print-to-PDF for each file sequentially
        for (const block of selectedBlocks) {
          setCurrentFile(block.label);

          let source: BlockSourceFile | null = null;
          try { source = await fetchBlockSourceFile(block); } catch {}

          const html = createViewerHtml(block, source);
          const headingName = extractTopHeading(html) || block.label;
          const safeName = sanitizeDocumentName(headingName);

          // If already a PDF, download directly
          if (source?.ext === 'pdf') {
            downloadBytesAsFile(source.bytes, `${safeName}.pdf`, 'application/pdf');
          } else {
            toast.info(`Print dialog for "${headingName}" — choose "Save as PDF"`, { duration: 4000 });
            await printHtmlAsPdf(html, headingName);
          }

          done++;
          setProgress(Math.round((done / total) * 100));
        }
      } else {
        // Word export — use folder picker or individual downloads
        let dirHandle: FileSystemDirectoryHandle | null = null;
        if ('showDirectoryPicker' in window) {
          try {
            dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
          } catch (err: any) {
            if (err?.name === 'AbortError') {
              setExporting(false);
              return;
            }
            dirHandle = null;
          }
        }

        for (const block of selectedBlocks) {
          setCurrentFile(block.label);
          const result = await exportSingleBlockAsDocx(block);

          if (dirHandle) {
            const fileHandle = await dirHandle.getFileHandle(result.fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(result.data.buffer.slice(result.data.byteOffset, result.data.byteOffset + result.data.byteLength) as ArrayBuffer);
            await writable.close();
          } else {
            downloadBytesAsFile(result.data, result.fileName, result.mimeType);
            if (done < total - 1) await new Promise(r => setTimeout(r, 800));
          }

          done++;
          setProgress(Math.round((done / total) * 100));
        }
      }

      toast.success(`${done} file${done > 1 ? 's' : ''} exported successfully!`);
      onClose();
    } catch (err) {
      console.error('Group download failed:', err);
      toast.error('Export failed. Please try again.');
    } finally {
      setExporting(false);
      setProgress(0);
      setCurrentFile('');
    }
  }, [groupBlocks, selected, format, onClose]);

  return (
    <>
      <Dialog open={open && !exporting} onOpenChange={v => !v && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Download — {group.label}</DialogTitle>
            <DialogDescription>
              Select files to export via browser rendering, then choose a folder.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Select all toggle */}
            <div className="flex items-center gap-2 pb-1 border-b border-border">
              <Checkbox
                checked={selected.size === groupBlocks.length}
                onCheckedChange={toggleAll}
                id="select-all"
              />
              <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                Select all ({groupBlocks.length})
              </label>
            </div>

            {/* File list */}
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {groupBlocks.map(block => (
                <div key={block.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-accent/50">
                  <Checkbox
                    checked={selected.has(block.id)}
                    onCheckedChange={() => toggleBlock(block.id)}
                    id={`block-${block.id}`}
                  />
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <label htmlFor={`block-${block.id}`} className="text-sm truncate cursor-pointer flex-1">
                    {block.label}
                  </label>
                  {block.fileName && (
                    <span className="text-xs text-muted-foreground truncate max-w-24">
                      {block.fileName}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Format picker */}
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs font-medium">Export Format</Label>
              <RadioGroup value={format} onValueChange={v => setFormat(v as ExportFormat)} className="flex gap-4">
                <div className="flex items-center space-x-1.5">
                  <RadioGroupItem value="pdf" id="grp-fmt-pdf" />
                  <Label htmlFor="grp-fmt-pdf" className="cursor-pointer text-sm">PDF</Label>
                </div>
                <div className="flex items-center space-x-1.5">
                  <RadioGroupItem value="word" id="grp-fmt-word" />
                  <Label htmlFor="grp-fmt-word" className="cursor-pointer text-sm">Word (.docx)</Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleDownloadClick} disabled={selected.size === 0} className="w-full gap-2">
              <Download className="h-4 w-4" />
              Download {selected.size} file{selected.size !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation alert */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Export</AlertDialogTitle>
            <AlertDialogDescription>
              {format === 'pdf'
                ? `${selected.size} file${selected.size !== 1 ? 's' : ''} will open the browser print dialog sequentially — choose "Save as PDF" for each one.`
                : `${selected.size} file${selected.size !== 1 ? 's' : ''} will be rendered as Word (.docx) documents.${
                    'showDirectoryPicker' in window ? ' You will be asked to choose a destination folder.' : ' Files will be downloaded individually.'
                  }`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmExport}>
              <File className="h-4 w-4 mr-1" />
              Export All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Export progress overlay */}
      {exporting && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-80 space-y-4 shadow-lg">
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="font-medium text-sm">Exporting files…</span>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground truncate">
              {currentFile || 'Preparing…'}
            </p>
            <p className="text-xs text-muted-foreground text-right">{progress}%</p>
          </div>
        </div>
      )}
    </>
  );
}
