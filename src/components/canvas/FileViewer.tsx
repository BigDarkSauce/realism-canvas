import { X, Pencil, Eye, Save, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import EditorToolbar from './EditorToolbar';

export type FileViewerMode = 'view' | 'edit';

interface FileViewerProps {
  url: string;
  fileName?: string;
  mode: FileViewerMode;
  onClose: () => void;
}

function useHtmlContent(url: string, fileName?: string) {
  const ext = (fileName || url).split('.').pop()?.toLowerCase() || '';
  const isHtml = ext === 'html' || ext === 'htm';
  const [htmlContent, setHtmlContent] = useState<string | null>(null);

  useEffect(() => {
    if (!isHtml) return;
    fetch(url)
      .then(r => r.text())
      .then(setHtmlContent)
      .catch(() => setHtmlContent(null));
  }, [url, isHtml]);

  return { isHtml, htmlContent };
}

function getViewerContent(url: string, fileName?: string, htmlContent?: string | null) {
  const ext = (fileName || url).split('.').pop()?.toLowerCase() || '';
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
  const isVideo = ['mp4', 'webm', 'ogg', 'mov'].includes(ext);
  const isPdf = ext === 'pdf';
  const isHtml = ext === 'html' || ext === 'htm';

  const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
  const isVimeo = url.includes('vimeo.com');

  if (isYoutube) {
    const videoId = url.includes('youtu.be')
      ? url.split('/').pop()?.split('?')[0]
      : new URL(url).searchParams.get('v');
    return (
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        className="w-full h-full"
        allowFullScreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      />
    );
  }

  if (isVimeo) {
    const videoId = url.split('/').pop();
    return (
      <iframe
        src={`https://player.vimeo.com/video/${videoId}`}
        className="w-full h-full"
        allowFullScreen
      />
    );
  }

  if (isImage) {
    return (
      <div className="flex items-center justify-center w-full h-full p-8">
        <img src={url} alt={fileName || 'Image'} className="max-w-full max-h-full object-contain" />
      </div>
    );
  }

  if (isVideo) {
    return (
      <video src={url} controls className="w-full h-full" autoPlay>
        Your browser does not support this video.
      </video>
    );
  }

  if (isHtml && htmlContent) {
    return (
      <iframe
        srcDoc={htmlContent}
        className="w-full h-full bg-white"
        title={fileName || 'Document'}
        sandbox="allow-same-origin"
      />
    );
  }

  if (isPdf) {
    return <iframe src={url} className="w-full h-full" title={fileName || 'PDF'} />;
  }

  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) {
    return (
      <iframe
        src={`https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`}
        className="w-full h-full"
        title={fileName || 'Document'}
      />
    );
  }

  return <iframe src={url} className="w-full h-full" title={fileName || 'File'} />;
}

/** Extract the storage path from a public URL */
function extractStoragePath(url: string): string | null {
  const marker = '/object/public/canvas-files/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.substring(idx + marker.length));
}

function HtmlEditor({ url, htmlContent, onClose }: { url: string; htmlContent: string; onClose: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storagePath = extractStoragePath(url);

  // Make the iframe editable once loaded
  const handleLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.body) return;
    iframe.contentDocument.designMode = 'on';
    iframe.contentDocument.body.contentEditable = 'true';

    // Make images selectable and draggable
    const style = iframe.contentDocument.createElement('style');
    style.textContent = `
      img {
        cursor: move;
        max-width: 100%;
        user-select: auto;
      }
      img:hover {
        outline: 2px solid #3b82f6;
        outline-offset: 2px;
      }
      img::selection, img:focus {
        outline: 2px solid #3b82f6;
        outline-offset: 2px;
      }
    `;
    iframe.contentDocument.head.appendChild(style);

    // Enable image dragging within the document
    let draggedImg: HTMLImageElement | null = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    iframe.contentDocument.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG') {
        e.preventDefault();
        draggedImg = target as HTMLImageElement;
        const rect = draggedImg.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
        draggedImg.style.position = draggedImg.style.position || '';
        draggedImg.style.outline = '2px solid #3b82f6';
      }
    });

    iframe.contentDocument.addEventListener('mousemove', (e) => {
      if (!draggedImg) return;
      e.preventDefault();
    });

    iframe.contentDocument.addEventListener('mouseup', (e) => {
      if (draggedImg) {
        draggedImg.style.outline = '';
        // Move image to cursor position in the document flow
        const doc = iframe.contentDocument!;
        const range = doc.caretRangeFromPoint?.(e.clientX, e.clientY);
        if (range && draggedImg.parentNode) {
          const parent = draggedImg.parentNode;
          parent.removeChild(draggedImg);
          range.insertNode(draggedImg);
          setDirty(true);
          if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
          autoSaveTimer.current = setTimeout(() => { saveContent(); }, 3000);
        }
        draggedImg = null;
      }
    });

    // Allow resizing images by selecting
    iframe.contentDocument.addEventListener('dblclick', (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG') {
        const img = target as HTMLImageElement;
        const newWidth = prompt('Enter image width (e.g. 300, 50%):', img.style.width || `${img.width}`);
        if (newWidth) {
          img.style.width = newWidth.includes('%') ? newWidth : `${newWidth}px`;
          img.style.height = 'auto';
          setDirty(true);
          if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
          autoSaveTimer.current = setTimeout(() => { saveContent(); }, 3000);
        }
      }
    });

    // Listen for changes
    iframe.contentDocument.addEventListener('input', () => {
      setDirty(true);
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        saveContent();
      }, 3000);
    });
  }, []);

  const getEditedHtml = useCallback((): string | null => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return null;
    return '<!DOCTYPE html>\n' + iframe.contentDocument.documentElement.outerHTML;
  }, []);

  const saveContent = useCallback(async () => {
    if (!storagePath) {
      toast.error('Cannot save: file path not found');
      return;
    }
    const editedHtml = getEditedHtml();
    if (!editedHtml) return;

    setSaving(true);
    try {
      const blob = new Blob([editedHtml], { type: 'text/html' });
      const { error } = await supabase.storage
        .from('canvas-files')
        .update(storagePath, blob, { upsert: true, contentType: 'text/html' });
      if (error) throw error;
      setDirty(false);
      toast.success('Saved');
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save');
    }
    setSaving(false);
  }, [storagePath, getEditedHtml]);

  // Cleanup timer on unmount & save if dirty
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  // Save on close if dirty
  const handleClose = useCallback(async () => {
    if (dirty) {
      await saveContent();
    }
    onClose();
  }, [dirty, saveContent, onClose]);

  const markDirty = useCallback(() => {
    setDirty(true);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { saveContent(); }, 3000);
  }, [saveContent]);

  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  const downloadAsHtml = useCallback(() => {
    const editedHtml = getEditedHtml();
    if (!editedHtml) return;
    const blob = new Blob([editedHtml], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (url.split('/').pop() || 'document.html');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    toast.success('Downloaded as HTML');
    setShowDownloadMenu(false);
  }, [getEditedHtml, url]);

  const downloadAsWord = useCallback(() => {
    const editedHtml = getEditedHtml();
    if (!editedHtml) return;

    // Extract body content from full HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(editedHtml, 'text/html');
    const bodyHtml = doc.body?.innerHTML || editedHtml;

    // Collect inline styles from the original document's <style> tags
    let existingStyles = '';
    doc.querySelectorAll('style').forEach(s => { existingStyles += s.textContent || ''; });

    // Scan for all font families used in the document to preserve them
    const usedFonts = new Set<string>();
    doc.body.querySelectorAll('*').forEach(el => {
      const ff = (el as HTMLElement).style?.fontFamily;
      if (ff) usedFonts.add(ff.replace(/['"]/g, ''));
    });

    // Build font-face declarations for detected math/special fonts
    let dynamicFontFaces = '';
    const mathFonts = ['Cambria Math', 'Cambria', 'Symbol', 'MT Extra'];
    mathFonts.forEach(f => {
      dynamicFontFaces += `
      @font-face {
        font-family: "${f}";
        panose-1: 2 4 5 3 5 4 6 3 2 4;
      }`;
    });

    // Process math elements: ensure all elements with math-related content preserve their font
    const bodyEl = doc.body.cloneNode(true) as HTMLElement;
    bodyEl.querySelectorAll('*').forEach(el => {
      const htmlEl = el as HTMLElement;
      const text = htmlEl.textContent || '';
      // Check if element contains math unicode characters
      const hasMathChars = /[±×÷≠≈≤≥∞√∑∏∫πθαβγδΔλμσφω∂∇∈∉⊂⊃∪∩∅∀∃⇒⇔→←↑↓]/.test(text);
      const hasMathFont = htmlEl.style?.fontFamily?.includes('Cambria Math') || 
                          htmlEl.style?.fontFamily?.includes('Math') ||
                          htmlEl.className?.includes('math');
      
      if (hasMathChars || hasMathFont) {
        htmlEl.style.fontFamily = '"Cambria Math", "Cambria", serif';
        htmlEl.setAttribute('data-mso-font-charset', '0');
      }
      
      // Preserve superscript/subscript styling for Word
      if (htmlEl.tagName === 'SUP') {
        htmlEl.style.fontSize = '8pt';
        htmlEl.style.verticalAlign = 'super';
      }
      if (htmlEl.tagName === 'SUB') {
        htmlEl.style.fontSize = '8pt';
        htmlEl.style.verticalAlign = 'sub';
      }
    });

    const processedBody = bodyEl.innerHTML;

    const wordContent = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns:m="http://schemas.microsoft.com/office/2004/12/omml"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<title>Document</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
  ${dynamicFontFaces}
  @font-face {
    font-family: "Calibri";
    panose-1: 2 15 5 2 2 2 4 3 2 4;
  }
  body {
    font-family: "Calibri", "Arial", sans-serif;
    font-size: 11pt;
    line-height: 1.5;
  }
  p { margin: 0 0 8pt 0; }
  table { border-collapse: collapse; }
  td, th { border: 1px solid #000; padding: 4pt 6pt; }
  /* Preserve math font styling */
  [style*="Cambria Math"], .math-symbol, .math-template,
  [data-mso-font-charset] {
    font-family: "Cambria Math", "Cambria", serif;
    mso-font-charset: 0;
    mso-generic-font-family: roman;
    mso-font-pitch: variable;
  }
  /* Fraction styling for Word */
  .math-fraction {
    mso-element: field-begin;
    font-family: "Cambria Math";
  }
  sup { font-size: 8pt; vertical-align: super; mso-text-raise: 30%; }
  sub { font-size: 8pt; vertical-align: sub; }
  /* Preserve overline for square root notation */
  [style*="overline"] {
    text-decoration: overline;
    font-family: "Cambria Math", serif;
  }
  ${existingStyles}
</style>
</head>
<body lang="EN-US" style="tab-interval:.5in">
${processedBody}
</body>
</html>`;
    const blob = new Blob(['\ufeff', wordContent], { type: 'application/msword' });
    const baseName = (url.split('/').pop() || 'document').replace(/\.\w+$/, '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${baseName}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    toast.success('Downloaded as Word');
    setShowDownloadMenu(false);
  }, [getEditedHtml, url]);

  const downloadAsPdf = useCallback(async () => {
    const editedHtml = getEditedHtml();
    if (!editedHtml) return;
    const baseName = (url.split('/').pop() || 'document').replace(/\.\w+$/, '');
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const container = document.createElement('div');
      container.innerHTML = editedHtml;
      document.body.appendChild(container);
      await html2pdf().set({
        margin: 10,
        filename: `${baseName}.pdf`,
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).from(container).save();
      document.body.removeChild(container);
      toast.success('Downloaded as PDF');
    } catch {
      toast.error('PDF generation failed');
    }
    setShowDownloadMenu(false);
  }, [getEditedHtml, url]);

  const downloadAsPdfPrint = useCallback(() => {
    const editedHtml = getEditedHtml();
    if (!editedHtml) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to print as PDF');
      return;
    }
    printWindow.document.write(editedHtml);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
    toast.success('Print dialog opened');
    setShowDownloadMenu(false);
  }, [getEditedHtml]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-2">
          <Pencil className="h-4 w-4 text-primary" />
          <span className="text-sm font-mono text-foreground truncate">Editing: {url.split('/').pop()}</span>
          {dirty && <span className="text-[10px] text-amber-500 font-medium">• Unsaved</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDownloadMenu(!showDownloadMenu)}
              className="h-7 text-xs gap-1"
              title="Download to PC"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
            {showDownloadMenu && (
              <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-lg z-50 min-w-[160px]">
                <button onClick={downloadAsWord} className="w-full text-left px-3 py-2 text-sm hover:bg-accent text-popover-foreground">
                  Word (.doc)
                </button>
                <button onClick={downloadAsPdf} className="w-full text-left px-3 py-2 text-sm hover:bg-accent text-popover-foreground">
                  PDF
                </button>
                <button onClick={downloadAsPdfPrint} className="w-full text-left px-3 py-2 text-sm hover:bg-accent text-popover-foreground">
                  PDF (via Print)
                </button>
                <button onClick={downloadAsHtml} className="w-full text-left px-3 py-2 text-sm hover:bg-accent text-popover-foreground border-t border-border">
                  HTML
                </button>
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={saveContent}
            disabled={saving || !dirty}
            className="h-7 text-xs gap-1"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClose} className="h-8 w-8 p-0">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <EditorToolbar iframeRef={iframeRef} onContentChange={markDirty} />
      <div className="flex-1 overflow-hidden">
        <iframe
          ref={iframeRef}
          srcDoc={htmlContent}
          className="w-full h-full bg-white"
          title="Edit Document"
          sandbox="allow-same-origin allow-scripts"
          onLoad={handleLoad}
        />
      </div>
    </div>
  );
}

export default function FileViewer({ url, fileName, mode, onClose }: FileViewerProps) {
  const { isHtml, htmlContent } = useHtmlContent(url, fileName);

  // Edit mode for HTML files
  if (mode === 'edit' && isHtml && htmlContent) {
    return <HtmlEditor url={url} htmlContent={htmlContent} onClose={onClose} />;
  }

  // Edit mode for non-HTML: fall back to view with a notice
  if (mode === 'edit' && !isHtml) {
    toast.info('Editing is only supported for HTML files. Opening in view mode.');
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-mono text-foreground truncate">{fileName || url}</span>
        </div>
        <div className="flex items-center gap-2">
          <a href={url} download={fileName || 'file'} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          </a>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {getViewerContent(url, fileName, htmlContent)}
      </div>
    </div>
  );
}
