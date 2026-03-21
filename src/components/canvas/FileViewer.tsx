import { X, Pencil, Eye, Save, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import EditorToolbar from './EditorToolbar';
import { ThemeToggle } from '@/components/ThemeSelector';

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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isHtml) return;
    setLoading(true);
    fetch(url)
      .then(r => r.text())
      .then((text) => { setHtmlContent(text); setLoading(false); })
      .catch(() => { setHtmlContent(null); setLoading(false); });
  }, [url, isHtml]);

  return { isHtml, htmlContent, loading };
}

/** Get the iframe-friendly background colors for the current theme */
function getIframeThemeStyles(): { bg: string; color: string } {
  const isDark = document.documentElement.classList.contains('dark');
  return isDark
    ? { bg: '#2a2d35', color: '#e0e0e0' }
    : { bg: '#ffffff', color: '#000000' };
}

/** Inject or update theme styles into an iframe document for ALL same-origin HTML */
function applyIframeTheme(doc: Document) {
  const { bg, color } = getIframeThemeStyles();
  let style = doc.getElementById('__viewer-theme') as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = '__viewer-theme';
    doc.head.appendChild(style);
  }
  style.textContent = `
    html, body { background-color: ${bg} !important; color: ${color} !important; }
    * { color: ${color} !important; }
    a { color: #6ea8fe !important; }
    img, video, svg, canvas, iframe, math-field { color: unset !important; }
  `;
}

/** Remove theme overrides from an iframe so the document renders with its own styles */
function removeIframeTheme(doc: Document) {
  const style = doc.getElementById('__viewer-theme');
  if (style) style.remove();
}

/** Detect if the HTML content was authored by our editor (has our markers or is simple HTML) */
function isOurHtmlContent(htmlContent: string | null | undefined, fileName?: string): boolean {
  if (!htmlContent) return false;
  // Word documents opened via Google Docs viewer won't have htmlContent
  // Our editor-created HTML files typically don't have Word XML namespaces
  const isWordDoc = htmlContent.includes('xmlns:o="urn:schemas-microsoft-com:office:office"') ||
    htmlContent.includes('xmlns:w="urn:schemas-microsoft-com:office:word"') ||
    htmlContent.includes('mso-');
  if (isWordDoc) return false;
  // If it's a .doc/.docx/.xls etc, it's not our HTML
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf'].includes(ext)) return false;
  return true;
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
        className="w-full h-full"
        title={fileName || 'Document'}
        sandbox="allow-same-origin"
        onLoad={(e) => {
          const doc = (e.target as HTMLIFrameElement).contentDocument!;
          applyIframeTheme(doc);
          if (!doc.querySelector('link[href*="mathlive"]')) {
            const link = doc.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://cdn.jsdelivr.net/npm/mathlive/mathlive-static.css';
            doc.head.appendChild(link);
          }
        }}
      />
    );
  }

  // HTML is loading — show spinner instead of raw code fallback
  if (isHtml && !htmlContent) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
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
    applyIframeTheme(iframe.contentDocument);

    // Inject MathLive static CSS for rendered equations
    const mathLink = iframe.contentDocument.createElement('link');
    mathLink.rel = 'stylesheet';
    mathLink.href = 'https://cdn.jsdelivr.net/npm/mathlive/mathlive-static.css';
    iframe.contentDocument.head.appendChild(mathLink);

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
      .math-expression {
        display: inline-block;
        vertical-align: middle;
        cursor: default;
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

    // Listen for changes — debounced to avoid lag
    let inputDebounce: ReturnType<typeof setTimeout> | null = null;
    iframe.contentDocument.addEventListener('input', () => {
      if (inputDebounce) clearTimeout(inputDebounce);
      inputDebounce = setTimeout(() => {
        setDirty(true);
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(() => {
          saveContent();
        }, 3000);
      }, 300);
    });

    // Make math spans editable
    iframe.contentDocument.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const mathSpan = target.closest('.math-unicode, .math-template, .math-symbol') as HTMLElement | null;
      if (!mathSpan) return;
      const next = mathSpan.nextSibling;
      if (!next || (next.nodeType === 3 && next.textContent === '\u200B')) return;
      const zws = iframe.contentDocument!.createTextNode('\u200B');
      mathSpan.parentNode?.insertBefore(zws, mathSpan.nextSibling);
    });

    iframe.contentDocument.body.style.cssText += 'cursor: text;';
    iframe.contentDocument.querySelectorAll('.math-unicode, .math-template, .math-symbol').forEach(el => {
      (el as HTMLElement).style.cursor = 'text';
      if (!el.nextSibling || (el.nextSibling.nodeType !== 3)) {
        el.parentNode?.insertBefore(iframe.contentDocument!.createTextNode('\u200B'), el.nextSibling);
      }
      if (!el.previousSibling || (el.previousSibling.nodeType !== 3)) {
        el.parentNode?.insertBefore(iframe.contentDocument!.createTextNode('\u200B'), el);
      }
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
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save');
    }
    setSaving(false);
  }, [storagePath, getEditedHtml]);

  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  // Listen for theme changes and update iframe — only for our HTML
  useEffect(() => {
    const handler = () => {
      const doc = iframeRef.current?.contentDocument;
      if (doc) applyIframeTheme(doc);
    };
    window.addEventListener('themechange', handler);
    return () => window.removeEventListener('themechange', handler);
  }, []);

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

  const getDefaultFileName = useCallback((): string => {
    const doc = iframeRef.current?.contentDocument;
    if (doc) {
      const h1 = doc.querySelector('h1');
      if (h1?.textContent?.trim()) return h1.textContent.trim();
      const h2 = doc.querySelector('h2');
      if (h2?.textContent?.trim()) return h2.textContent.trim();
    }
    return 'Document';
  }, []);

  const promptFileName = useCallback((ext: string): string | null => {
    const defaultName = getDefaultFileName();
    const name = prompt(`Enter file name:`, defaultName);
    if (name === null) return null;
    const clean = (name.trim() || defaultName).replace(/[<>:"/\\|?*]/g, '_');
    return `${clean}.${ext}`;
  }, [getDefaultFileName]);

  const downloadAsHtml = useCallback(() => {
    const editedHtml = getEditedHtml();
    if (!editedHtml) return;
    const fileName = promptFileName('html');
    if (!fileName) return;
    const blob = new Blob([editedHtml], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    toast.success('Downloaded as HTML');
    setShowDownloadMenu(false);
  }, [getEditedHtml, promptFileName]);

  const downloadAsWord = useCallback(() => {
    const editedHtml = getEditedHtml();
    if (!editedHtml) return;

    const parser = new DOMParser();
    const doc = parser.parseFromString(editedHtml, 'text/html');
    const bodyHtml = doc.body?.innerHTML || editedHtml;

    let existingStyles = '';
    doc.querySelectorAll('style').forEach(s => { existingStyles += s.textContent || ''; });

    const usedFonts = new Set<string>();
    doc.body.querySelectorAll('*').forEach(el => {
      const ff = (el as HTMLElement).style?.fontFamily;
      if (ff) usedFonts.add(ff.replace(/['"]/g, ''));
    });

    let dynamicFontFaces = '';
    const mathFonts = ['Cambria Math', 'Cambria', 'Symbol', 'MT Extra'];
    mathFonts.forEach(f => {
      dynamicFontFaces += `
      @font-face {
        font-family: "${f}";
        panose-1: 2 4 5 3 5 4 6 3 2 4;
      }`;
    });

    const bodyEl = doc.body.cloneNode(true) as HTMLElement;
    bodyEl.querySelectorAll('*').forEach(el => {
      const htmlEl = el as HTMLElement;
      const className = (htmlEl.getAttribute('class') || '').toString();
      const isInsideMathExpression = !!htmlEl.closest?.('.math-expression');
      const isMathLiveNode = /(^|\s)ML__/.test(className);

      if (isInsideMathExpression || isMathLiveNode) return;

      const text = htmlEl.textContent || '';
      const hasMathChars = /[±×÷≠≈≤≥∞√∑∏∫πθαβγδΔλμσφω∂∇∈∉⊂⊃∪∩∅∀∃⇒⇔→←↑↓]/.test(text);
      const hasMathFont = htmlEl.style?.fontFamily?.includes('Cambria Math') ||
                          htmlEl.style?.fontFamily?.includes('Math') ||
                          htmlEl.className?.includes('math');

      if (hasMathChars || hasMathFont) {
        htmlEl.style.fontFamily = '"Cambria Math", "Cambria", serif';
        htmlEl.setAttribute('data-mso-font-charset', '0');
      }

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
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="Microsoft Word 15">
<meta name="Originator" content="Microsoft Word 15">
<style>
${dynamicFontFaces}
${existingStyles}
@page { margin: 1in; }
body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; }
table { border-collapse: collapse; }
td, th { border: 1px solid #000; padding: 4px 8px; }
</style>
</head>
<body>
${processedBody}
</body>
</html>`;

    const fileName = promptFileName('doc');
    if (!fileName) return;
    const blob = new Blob([wordContent], { type: 'application/msword' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    toast.success('Downloaded as Word');
    setShowDownloadMenu(false);
  }, [getEditedHtml, promptFileName]);

  const downloadAsPdf = useCallback(async () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    const fileName = promptFileName('pdf');
    if (!fileName) return;

    try {
      const { default: html2pdf } = await import('html2pdf.js');
      const element = iframe.contentDocument.body;
      await html2pdf().set({
        margin: 0.5,
        filename: fileName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
      }).from(element).save();
      toast.success('Downloaded as PDF');
    } catch (err) {
      console.error('PDF export error:', err);
      toast.error('PDF export failed');
    }
    setShowDownloadMenu(false);
  }, [promptFileName]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border">
        <div className="flex items-center gap-2">
          <Pencil className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-mono text-foreground truncate">Editing</span>
          {dirty && <span className="text-xs text-primary">(unsaved)</span>}
          {saving && <span className="text-xs text-muted-foreground">(saving…)</span>}
        </div>
        <div className="flex items-center gap-2">
          <EditorToolbar iframeRef={iframeRef} onContentChange={markDirty} />

          <div className="relative">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowDownloadMenu(!showDownloadMenu)}>
              <Download className="h-3.5 w-3.5" /> Download
            </Button>
            {showDownloadMenu && (
              <div className="absolute top-full right-0 mt-1 bg-popover border border-border rounded-md shadow-lg py-1 z-10 min-w-[140px]">
                <button className="block w-full text-left px-3 py-1.5 text-xs hover:bg-accent text-foreground" onClick={downloadAsHtml}>
                  HTML
                </button>
                <button className="block w-full text-left px-3 py-1.5 text-xs hover:bg-accent text-foreground" onClick={downloadAsWord}>
                  Word (.doc)
                </button>
                <button className="block w-full text-left px-3 py-1.5 text-xs hover:bg-accent text-foreground" onClick={downloadAsPdf}>
                  PDF
                </button>
              </div>
            )}
          </div>

          <Button variant="outline" size="sm" onClick={() => saveContent()} disabled={saving || !dirty} className="h-7 text-xs gap-1">
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
          <ThemeToggle className="h-7 w-7" />
          <Button variant="ghost" size="sm" onClick={handleClose} className="h-8 w-8 p-0">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <iframe
          ref={iframeRef}
          srcDoc={htmlContent}
          className="w-full h-full"
          title="Edit Document"
          sandbox="allow-same-origin allow-scripts"
          onLoad={handleLoad}
        />
      </div>
    </div>
  );
}

export default function FileViewer({ url, fileName, mode, onClose }: FileViewerProps) {
  const { isHtml, htmlContent, loading } = useHtmlContent(url, fileName);
  const viewerRef = useRef<HTMLDivElement>(null);
  const ours = isOurHtmlContent(htmlContent, fileName);

  // Listen for theme changes and update any iframe in the viewer — only for our HTML
  useEffect(() => {
    const handler = () => {
      if (!ours) return;
      const iframe = viewerRef.current?.querySelector('iframe') as HTMLIFrameElement | null;
      if (iframe?.contentDocument) applyIframeTheme(iframe.contentDocument, true);
    };
    window.addEventListener('themechange', handler);
    return () => window.removeEventListener('themechange', handler);
  }, [ours]);

  if (isHtml && loading) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
          <span className="text-sm text-muted-foreground">Loading document…</span>
        </div>
      </div>
    );
  }

  if (mode === 'edit' && isHtml && htmlContent) {
    return <HtmlEditor url={url} htmlContent={htmlContent} onClose={onClose} />;
  }

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
          <ThemeToggle className="h-7 w-7" />
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <div ref={viewerRef} className="flex-1 overflow-hidden">
        {getViewerContent(url, fileName, htmlContent)}
      </div>
    </div>
  );
}
