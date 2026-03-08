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

    // Listen for changes
    iframe.contentDocument.addEventListener('input', () => {
      setDirty(true);
      // Auto-save after 3 seconds of inactivity
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

  const handleDownload = useCallback(() => {
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
    toast.success('Downloaded');
  }, [getEditedHtml, url]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-2">
          <Pencil className="h-4 w-4 text-primary" />
          <span className="text-sm font-mono text-foreground truncate">Editing: {url.split('/').pop()}</span>
          {dirty && <span className="text-[10px] text-amber-500 font-medium">• Unsaved</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="h-7 text-xs gap-1"
            title="Download to PC"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
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
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex-1 overflow-hidden">
        {getViewerContent(url, fileName, htmlContent)}
      </div>
    </div>
  );
}
