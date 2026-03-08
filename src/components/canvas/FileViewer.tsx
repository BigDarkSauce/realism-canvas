import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';

interface FileViewerProps {
  url: string;
  fileName?: string;
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

export default function FileViewer({ url, fileName, onClose }: FileViewerProps) {
  const { htmlContent } = useHtmlContent(url, fileName);

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
        <span className="text-sm font-mono text-foreground truncate">{fileName || url}</span>
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
