import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { FileText, Loader2, SplitSquareVertical, X, ArrowLeft, Highlighter, Eye, RotateCcw, Search, ChevronUp, ChevronDown } from 'lucide-react';
import {
  extractDocxParagraphs,
  extractPdfParagraphs,
  splitBySelectedHeadings,
  createSectionFile,
  DocumentParagraph,
  DocumentSection,
} from '@/lib/documentParser';
import { uploadAndGetSignedUrl } from '@/lib/storage';
import { toast } from 'sonner';

interface DocumentSplitterProps {
  open: boolean;
  onClose: () => void;
  onSectionsCreated: (sections: { heading: string; fileUrl: string; fileName: string }[]) => void;
}

type Step = 'upload' | 'highlight' | 'preview';

export default function DocumentSplitter({ open, onClose, onSectionsCreated }: DocumentSplitterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<'pdf' | 'docx' | null>(null);
  const [paragraphs, setParagraphs] = useState<DocumentParagraph[]>([]);
  const [headingIndices, setHeadingIndices] = useState<Set<number>>(new Set());
  const [sections, setSections] = useState<DocumentSection[] | null>(null);
  const [step, setStep] = useState<Step>('upload');
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [pdfPageUrls, setPdfPageUrls] = useState<string[]>([]);
  const [pdfPageDimensions, setPdfPageDimensions] = useState<{ width: number; height: number }[]>([]);
  const [pdfLineRects, setPdfLineRects] = useState<Map<number, { page: number; top: number; height: number }>>(new Map());
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileObjectUrl, setFileObjectUrl] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return paragraphs
      .map((p, i) => ({ index: i, match: p.text.toLowerCase().includes(q) }))
      .filter(m => m.match)
      .map(m => m.index);
  }, [searchQuery, paragraphs]);

  const reset = () => {
    setFile(null);
    setFileType(null);
    setParagraphs([]);
    setHeadingIndices(new Set());
    setSections(null);
    setStep('upload');
    setPdfPageUrls([]);
    setPdfPageDimensions([]);
    setPdfLineRects(new Map());
    setSearchQuery('');
    setSearchOpen(false);
    setActiveMatchIdx(0);
    if (fileObjectUrl) URL.revokeObjectURL(fileObjectUrl);
    setFileObjectUrl(null);
  };

  // Ctrl+F to open search in highlight step
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && step === 'highlight') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step, searchOpen]);

  // Reset active match when query changes
  useEffect(() => { setActiveMatchIdx(0); }, [searchQuery]);

  const navigateMatch = (dir: 1 | -1) => {
    if (searchMatches.length === 0) return;
    setActiveMatchIdx(prev => (prev + dir + searchMatches.length) % searchMatches.length);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const ext = selected.name.split('.').pop()?.toLowerCase() as 'pdf' | 'docx';
    if (ext !== 'pdf' && ext !== 'docx') {
      toast.error('Only PDF and DOCX files are supported');
      return;
    }

    setFile(selected);
    setFileType(ext);
    setParsing(true);
    setParseProgress(0);
    try {
      if (ext === 'docx') {
        const paras = await extractDocxParagraphs(selected, (p) => setParseProgress(Math.round(p * 100)));
        if (paras.length === 0) { toast.error('No text found'); setParsing(false); return; }
        setParagraphs(paras);
        const initial = new Set<number>();
        paras.forEach((p, i) => { if (p.isLikelyHeading) initial.add(i); });
        setHeadingIndices(initial);
      } else {
        // PDF: extract paragraphs with smooth progress
        const paras = await extractPdfParagraphs(selected, (p) => setParseProgress(Math.round(p * 80)));
        if (paras.length === 0) { toast.error('No text found'); setParsing(false); return; }
        setParagraphs(paras);
        const initial = new Set<number>();
        paras.forEach((p, i) => { if (p.isLikelyHeading) initial.add(i); });
        setHeadingIndices(initial);

        // Render PDF pages to canvas for visual display
        setParseProgress(85);
        await renderPdfPages(selected);
        setParseProgress(100);
      }
      setStep('highlight');
    } catch (err) {
      console.error('Parse error:', err);
      toast.error('Failed to parse document');
    }
    setParsing(false);
  };

  const renderPdfPages = async (pdfFile: File) => {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const urls: string[] = [];
    const dims: { width: number; height: number }[] = [];
    const SCALE = 1.5;

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      urls.push(canvas.toDataURL('image/jpeg', 0.85));
      dims.push({ width: viewport.width, height: viewport.height });
    }

    setPdfPageUrls(urls);
    setPdfPageDimensions(dims);
  };

  const toggleHeading = useCallback((index: number) => {
    setHeadingIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const handleConfirmHeadings = () => {
    const result = splitBySelectedHeadings(paragraphs, headingIndices);
    setSections(result);
    setStep('preview');
  };

  const handleCreateBlocks = async () => {
    if (!sections || sections.length === 0) return;
    setUploading(true);

    try {
      const results: { heading: string; fileUrl: string; fileName: string }[] = [];
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        const sectionFile = createSectionFile(section, i, 'html');
        const path = `sections/${Date.now()}-${Math.random().toString(36).slice(2)}-${sectionFile.name}`;
        const { error } = await supabase.storage.from('canvas-files').upload(path, sectionFile);
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('canvas-files').getPublicUrl(path);
        results.push({ heading: section.heading, fileUrl: publicUrl, fileName: sectionFile.name });
      }
      onSectionsCreated(results);
      toast.success(`Created ${results.length} blocks on canvas`);
      onClose();
      reset();
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Failed to upload section files');
    }
    setUploading(false);
  };

  const clearAll = () => setHeadingIndices(new Set());
  const selectSuggested = () => {
    const s = new Set<number>();
    paragraphs.forEach((p, i) => { if (p.isLikelyHeading) s.add(i); });
    setHeadingIndices(s);
  };

  if (!open) return null;

  // Fullscreen overlay for highlight and preview steps
  const isFullscreen = step === 'highlight';

  return (
    <>
      {isFullscreen ? (
        /* FULLSCREEN HIGHLIGHT VIEW */
        <div className="fixed inset-0 z-[100] bg-background flex flex-col">
          {/* Top bar */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-2">
              <Highlighter className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Heading Highlighter</span>
            </div>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Click any paragraph to mark it as a section heading
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => { setSearchOpen(o => !o); setTimeout(() => searchInputRef.current?.focus(), 50); }}
                title="Search (Ctrl+F)"
              >
                <Search className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-primary font-medium">
                {headingIndices.size} heading{headingIndices.size !== 1 ? 's' : ''}
              </span>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={selectSuggested}>
                Auto-detect
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={clearAll}>
                Clear all
              </Button>
              <div className="w-px h-5 bg-border mx-1" />
              <Button size="sm" className="h-7 text-xs gap-1" onClick={handleConfirmHeadings}>
                <Eye className="h-3.5 w-3.5" />
                Preview Sections
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { onClose(); reset(); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Search bar */}
          {searchOpen && (
            <div className="flex items-center gap-2 px-4 py-1.5 bg-card border-b border-border shrink-0">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') navigateMatch(e.shiftKey ? -1 : 1);
                  if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); }
                }}
                placeholder="Search in document…"
                className="h-7 text-xs flex-1"
              />
              {searchQuery && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {searchMatches.length > 0 ? `${activeMatchIdx + 1}/${searchMatches.length}` : 'No results'}
                </span>
              )}
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => navigateMatch(-1)} disabled={searchMatches.length === 0}>
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => navigateMatch(1)} disabled={searchMatches.length === 0}>
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { setSearchOpen(false); setSearchQuery(''); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* File name bar */}
          <div className="px-4 py-1.5 bg-muted/30 border-b border-border shrink-0">
            <p className="text-xs text-muted-foreground">
              <FileText className="h-3 w-3 inline mr-1" />
              <span className="font-medium text-foreground">{file?.name}</span>
            </p>
          </div>

          {/* Document content area */}
          <div className="flex-1 overflow-y-auto">
            {fileType === 'docx' ? (
              <DocxHighlightView
                paragraphs={paragraphs}
                headingIndices={headingIndices}
                onToggle={toggleHeading}
                searchQuery={searchQuery}
                searchMatches={searchMatches}
                activeMatchParaIndex={searchMatches.length > 0 ? searchMatches[activeMatchIdx] : -1}
              />
            ) : (
              <PdfHighlightView
                paragraphs={paragraphs}
                headingIndices={headingIndices}
                onToggle={toggleHeading}
                pageUrls={pdfPageUrls}
                pageDimensions={pdfPageDimensions}
                searchQuery={searchQuery}
                searchMatches={searchMatches}
                activeMatchParaIndex={searchMatches.length > 0 ? searchMatches[activeMatchIdx] : -1}
              />
            )}
          </div>
        </div>
      ) : (
        /* COMPACT PANEL for upload & preview steps */
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[60] w-[480px] max-w-[90vw] bg-card border border-border rounded-xl shadow-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <SplitSquareVertical className="h-4 w-4 text-primary" />
              Split Document
            </h3>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { onClose(); reset(); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {step === 'upload' && (
            <>
              <p className="text-xs text-muted-foreground">
                Upload a PDF or Word file. You'll see the full document and highlight section headings.
              </p>
              {parsing ? (
                <div className="space-y-2 py-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Parsing document…
                    </span>
                    <span className="font-mono text-primary">{parseProgress}%</span>
                  </div>
                  <Progress value={parseProgress} className="h-2" />
                </div>
              ) : (
                <>
                  <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => fileRef.current?.click()}>
                    <FileText className="h-4 w-4" /> Choose PDF or DOCX
                  </Button>
                  <input ref={fileRef} type="file" className="hidden" accept=".pdf,.docx" onChange={handleFileSelect} />
                </>
              )}
            </>
          )}

          {step === 'preview' && sections && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {sections.length} section{sections.length !== 1 ? 's' : ''} ready:
              </p>
              <div className="max-h-60 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
                {sections.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 px-2 rounded text-xs hover:bg-accent/50">
                    <span className="text-muted-foreground font-mono w-5">{i + 1}.</span>
                    <span className="text-foreground truncate">{s.heading}</span>
                    <span className="text-muted-foreground ml-auto shrink-0">{s.content.length} chars</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCreateBlocks} disabled={uploading} className="flex-1 gap-2">
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SplitSquareVertical className="h-3.5 w-3.5" />}
                  {uploading ? 'Creating…' : `Create ${sections.length} Blocks`}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setStep('highlight')} className="gap-1">
                  <ArrowLeft className="h-3 w-3" /> Back
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ========== DOCX Highlight View ========== */
function DocxHighlightView({
  paragraphs,
  headingIndices,
  onToggle,
  searchQuery,
  searchMatches,
  activeMatchParaIndex,
}: {
  paragraphs: DocumentParagraph[];
  headingIndices: Set<number>;
  onToggle: (i: number) => void;
  searchQuery: string;
  searchMatches: number[];
  activeMatchParaIndex: number;
}) {
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeMatchParaIndex]);

  const isMatch = (i: number) => searchMatches.includes(i);

  return (
    <div className="max-w-[800px] mx-auto py-8 px-6">
      <div className="bg-card shadow-lg rounded-lg p-8 space-y-0" style={{ minHeight: '80vh' }}>
        {paragraphs.map((p, i) => {
          const isHeading = headingIndices.has(i);
          const matched = searchQuery && isMatch(i);
          const isActive = i === activeMatchParaIndex;
          return (
            <div
              key={i}
              ref={isActive ? activeRef : undefined}
              onClick={() => onToggle(i)}
              className={`
                cursor-pointer rounded px-3 py-1.5 transition-all select-none relative group
                ${isHeading
                  ? 'bg-primary/15 border-l-4 border-primary ring-1 ring-primary/20 my-3'
                  : 'hover:bg-accent/30 border-l-4 border-transparent'
                }
                ${matched && !isActive ? 'ring-1 ring-yellow-400/50 bg-yellow-400/10' : ''}
                ${isActive ? 'ring-2 ring-yellow-500 bg-yellow-400/20' : ''}
              `}
            >
              {p.html ? (
                <div
                  className={`pointer-events-none ${isHeading ? 'font-bold' : ''}`}
                  dangerouslySetInnerHTML={{ __html: p.html }}
                />
              ) : (
                <p className={`text-sm ${isHeading ? 'font-bold text-foreground text-base' : 'text-foreground/80'}`}>
                  {p.text}
                </p>
              )}
              {isHeading && (
                <span className="absolute -left-1 top-1/2 -translate-y-1/2 -translate-x-full text-[9px] font-bold text-primary bg-primary/10 rounded px-1 py-0.5 mr-1">
                  H
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ========== PDF Highlight View ========== */
function PdfHighlightView({
  paragraphs,
  headingIndices,
  onToggle,
  pageUrls,
  pageDimensions,
  searchQuery,
  searchMatches,
  activeMatchParaIndex,
}: {
  paragraphs: DocumentParagraph[];
  headingIndices: Set<number>;
  onToggle: (i: number) => void;
  pageUrls: string[];
  pageDimensions: { width: number; height: number }[];
  searchQuery: string;
  searchMatches: number[];
  activeMatchParaIndex: number;
}) {
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeMatchParaIndex]);

  const isMatch = (i: number) => searchMatches.includes(i);

  return (
    <div className="flex h-full">
      {/* Left: PDF rendered pages */}
      <div className="flex-1 overflow-y-auto bg-muted/50 p-4 flex flex-col items-center gap-4">
        {pageUrls.length > 0 ? (
          pageUrls.map((url, i) => (
            <div key={i} className="shadow-lg">
              <img
                src={url}
                alt={`Page ${i + 1}`}
                className="max-w-full"
                style={{ maxWidth: '700px' }}
              />
            </div>
          ))
        ) : (
          <div className="text-sm text-muted-foreground py-8">Rendering pages…</div>
        )}
      </div>

      {/* Right: Clickable text paragraphs */}
      <div className="w-[380px] border-l border-border overflow-y-auto bg-card p-3">
        <p className="text-xs text-muted-foreground mb-2 sticky top-0 bg-card py-1 z-10">
          Click paragraphs to mark as headings:
        </p>
        <div className="space-y-0">
          {paragraphs.map((p, i) => {
            const isHeading = headingIndices.has(i);
            const matched = searchQuery && isMatch(i);
            const isActive = i === activeMatchParaIndex;
            return (
              <div
                key={i}
                ref={isActive ? activeRef : undefined}
                onClick={() => onToggle(i)}
                className={`
                  cursor-pointer rounded px-2 py-1 transition-all select-none text-xs
                  ${isHeading
                    ? 'bg-primary/15 border-l-[3px] border-primary font-bold text-foreground my-1.5'
                    : 'text-muted-foreground hover:bg-accent/40 border-l-[3px] border-transparent'
                  }
                  ${matched && !isActive ? 'ring-1 ring-yellow-400/50 bg-yellow-400/10' : ''}
                  ${isActive ? 'ring-2 ring-yellow-500 bg-yellow-400/20' : ''}
                `}
              >
                {p.text}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
