import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText, Loader2, SplitSquareVertical, X, ArrowLeft } from 'lucide-react';
import {
  extractDocxParagraphs,
  extractPdfParagraphs,
  splitBySelectedHeadings,
  createSectionFile,
  DocumentParagraph,
  DocumentSection,
} from '@/lib/documentParser';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DocumentSplitterProps {
  open: boolean;
  onClose: () => void;
  onSectionsCreated: (sections: { heading: string; fileUrl: string; fileName: string }[]) => void;
}

type Step = 'upload' | 'pick-headings' | 'preview';

export default function DocumentSplitter({ open, onClose, onSectionsCreated }: DocumentSplitterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [paragraphs, setParagraphs] = useState<DocumentParagraph[]>([]);
  const [headingIndices, setHeadingIndices] = useState<Set<number>>(new Set());
  const [sections, setSections] = useState<DocumentSection[] | null>(null);
  const [step, setStep] = useState<Step>('upload');
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setParagraphs([]);
    setHeadingIndices(new Set());
    setSections(null);
    setStep('upload');
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const ext = selected.name.split('.').pop()?.toLowerCase();
    if (ext !== 'pdf' && ext !== 'docx') {
      toast.error('Only PDF and DOCX files are supported');
      return;
    }

    setFile(selected);
    setParsing(true);

    try {
      const paras = ext === 'docx'
        ? await extractDocxParagraphs(selected)
        : await extractPdfParagraphs(selected);

      if (paras.length === 0) {
        toast.error('No text found in this document');
        setParsing(false);
        return;
      }

      setParagraphs(paras);
      // Pre-select likely headings
      const initial = new Set<number>();
      paras.forEach((p, i) => { if (p.isLikelyHeading) initial.add(i); });
      setHeadingIndices(initial);
      setStep('pick-headings');
    } catch (err) {
      console.error('Parse error:', err);
      toast.error('Failed to parse document');
    }
    setParsing(false);
  };

  const toggleHeading = (index: number) => {
    setHeadingIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

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
        const sectionFile = createSectionFile(section, i, 'txt');
        const path = `sections/${Date.now()}-${Math.random().toString(36).slice(2)}-${sectionFile.name}`;

        const { error } = await supabase.storage.from('canvas-files').upload(path, sectionFile);
        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage.from('canvas-files').getPublicUrl(path);
        results.push({
          heading: section.heading,
          fileUrl: publicUrl,
          fileName: sectionFile.name,
        });
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

  if (!open) return null;

  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[60] w-[460px] bg-card border border-border rounded-xl shadow-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <SplitSquareVertical className="h-4 w-4 text-primary" />
          Split Document by Sections
        </h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { onClose(); reset(); }}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Step: Upload */}
      {step === 'upload' && (
        <>
          <p className="text-xs text-muted-foreground">
            Upload a PDF or Word file. You'll then pick which lines are headings to split by.
          </p>
          {parsing ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Parsing document...
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

      {/* Step: Pick headings */}
      {step === 'pick-headings' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{file?.name}</span> — Check the lines that should be treated as <strong>section headings</strong>:
          </p>
          <div className="max-h-72 overflow-y-auto space-y-0.5 border border-border rounded-lg p-2">
            {paragraphs.map((p, i) => (
              <label
                key={i}
                className={`flex items-start gap-2 py-1 px-2 rounded text-xs cursor-pointer hover:bg-accent/50 ${
                  headingIndices.has(i) ? 'bg-primary/10' : ''
                }`}
              >
                <Checkbox
                  checked={headingIndices.has(i)}
                  onCheckedChange={() => toggleHeading(i)}
                  className="mt-0.5 shrink-0"
                />
                <span className={`${headingIndices.has(i) ? 'font-semibold text-foreground' : 'text-muted-foreground'} break-words`}>
                  {p.text.length > 200 ? p.text.slice(0, 200) + '…' : p.text}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {headingIndices.size} heading{headingIndices.size !== 1 ? 's' : ''} selected
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleConfirmHeadings} className="flex-1">
              Split into Sections
            </Button>
            <Button size="sm" variant="outline" onClick={reset}>Reset</Button>
          </div>
        </div>
      )}

      {/* Step: Preview sections */}
      {step === 'preview' && sections && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {sections.length} section{sections.length !== 1 ? 's' : ''} ready:
          </p>
          <div className="max-h-48 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
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
              {uploading ? 'Creating...' : `Create ${sections.length} Blocks`}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setStep('pick-headings')} className="gap-1">
              <ArrowLeft className="h-3 w-3" /> Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
