import { useState } from 'react';
import { Youtube, Download, FileText, ExternalLink, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface YouTubeTranscriptProps {
  open: boolean;
  onClose: () => void;
}

export default function YouTubeTranscript({ open, onClose }: YouTubeTranscriptProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [videoId, setVideoId] = useState('');

  const handleFetchTranscript = async () => {
    if (!url.trim()) {
      toast.error('Please enter a YouTube URL');
      return;
    }

    setLoading(true);
    setTranscript('');
    setVideoTitle('');
    setVideoId('');

    try {
      const { data, error } = await supabase.functions.invoke('youtube-transcript', {
        body: { url: url.trim() },
      });

      if (error) {
        toast.error(error.message || 'Failed to fetch transcript');
        setLoading(false);
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        setLoading(false);
        return;
      }

      setTranscript(data.transcript);
      setVideoTitle(data.videoTitle || 'YouTube Video');
      setVideoId(data.videoId || '');
      toast.success('Transcript ready!');
    } catch (err) {
      toast.error('Failed to fetch transcript');
      console.error(err);
    }

    setLoading(false);
  };

  const handleDownloadPdf = () => {
    if (!transcript) return;

    const paragraphs = transcript.split('\n').filter((p: string) => p.trim());
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${videoTitle} - Transcript</title>
        <style>
          @media print {
            body { margin: 1in; }
          }
          body {
            font-family: 'Georgia', 'Times New Roman', serif;
            font-size: 12pt;
            line-height: 1.8;
            color: #1a1a1a;
            max-width: 700px;
            margin: 0 auto;
            padding: 40px 20px;
          }
          h1 {
            font-size: 18pt;
            font-weight: bold;
            margin-bottom: 8px;
            border-bottom: 2px solid #333;
            padding-bottom: 8px;
          }
          .meta {
            font-size: 10pt;
            color: #666;
            margin-bottom: 24px;
          }
          p {
            text-align: justify;
            margin-bottom: 14px;
            text-indent: 2em;
          }
          p:first-of-type { text-indent: 0; }
        </style>
      </head>
      <body>
        <h1>${videoTitle}</h1>
        <div class="meta">Transcript · ${new Date().toLocaleDateString()}</div>
        ${paragraphs.map((p: string) => `<p>${p}</p>`).join('\n')}
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    }
  };

  const handleCopyTranscript = () => {
    if (!transcript) return;
    navigator.clipboard.writeText(transcript);
    toast.success('Transcript copied to clipboard');
  };

  const getDownloadLink = () => {
    if (!videoId) return '';
    return `https://www.y2mate.com/youtube/${videoId}`;
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Youtube className="h-5 w-5 text-red-500" />
            YouTube Video Tool
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0">
          {/* URL Input */}
          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste YouTube URL here..."
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleFetchTranscript()}
            />
            <Button onClick={handleFetchTranscript} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Get Transcript'}
            </Button>
          </div>

          {/* Video download link */}
          {videoId && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
              <Download className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">Download video:</span>
              <a
                href={getDownloadLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                Open downloader <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {/* Transcript display */}
          {transcript && (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">{videoTitle}</h3>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={handleCopyTranscript} className="h-8 gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> Copy
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadPdf} className="h-8 gap-1.5">
                    <Download className="h-3.5 w-3.5" /> PDF
                  </Button>
                </div>
              </div>
              <ScrollArea className="flex-1 min-h-0 max-h-[50vh] border border-border rounded-lg p-4">
                <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                  {transcript}
                </div>
              </ScrollArea>
            </>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Fetching captions & formatting transcript...</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
