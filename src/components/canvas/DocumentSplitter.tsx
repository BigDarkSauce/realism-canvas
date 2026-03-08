import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Loader2, SplitSquareVertical, X } from 'lucide-react';
import { parseDocxSections, parsePdfSections, createSectionFile, DocumentSection } from '@/lib/documentParser';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DocumentSplitterProps {
  onSectionsCreated: (sections: { heading: string; fileUrl: string; fileName: string }[]) => void;
}

export default function DocumentSplitter({ onSectionsCreated }: DocumentSplitterProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sections, setSections] = useState<DocumentSection[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
    setSections(null);

    try {
      let parsed: DocumentSection[];
      if (ext === 'docx') {
        parsed = await parseDocxSections(selected);
      } else {
        parsed = await parsePdfSections(selected);
      }

      if (parsed.length === 0) {
        toast.error('No sections found in this document');
        setParsing(false);
        return;
      }

      setSections(parsed);
      toast.success(`Found ${parsed.length} sections`);
    } catch (err) {
      console.error('Parse error:', err);
      toast.error('Failed to parse document');
    }
    setParsing(false);
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
      setOpen(false);
      setFile(null);
      setSections(null);
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Failed to upload section files');
    }
    setUploading(false);
  };

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        title="Split Document by Sections"
        className="h-9 w-9 p-0"
      >
        <SplitSquareVertical className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <>
      <div className="absolute top-4 left-1/2 translate-x-[calc(50%+60px)] z-50">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          title="Split Document by Sections"
          className="h-9 w-9 p-0 bg-toolbar border border-toolbar-border rounded-lg"
        >
          <SplitSquareVertical className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <SplitSquareVertical className="h-4 w-4 text-primary" />
          Split Document by Sections
        </h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setOpen(false); setFile(null); setSections(null); }}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Upload a PDF or Word file. Sections split by headings will become connected blocks on the canvas.
      </p>

      {!file && (
        <>
          <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => fileRef.current?.click()}>
            <FileText className="h-4 w-4" /> Choose PDF or DOCX
          </Button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx"
            onChange={handleFileSelect}
          />
        </>
      )}

      {parsing && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Parsing document...
        </div>
      )}

      {file && sections && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{file.name}</span> — {sections.length} section{sections.length !== 1 ? 's' : ''} found:
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
            <Button size="sm" variant="outline" onClick={() => { setFile(null); setSections(null); }}>
              Reset
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
