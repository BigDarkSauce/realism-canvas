import { useEffect } from 'react';
import { Eye, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type FileOpenMode = 'view' | 'edit';

interface FileOpenDialogProps {
  fileName?: string;
  onSelect: (mode: FileOpenMode) => void;
  onClose: () => void;
}

export default function FileOpenDialog({ fileName, onSelect, onClose }: FileOpenDialogProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        onSelect('view');
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        onSelect('edit');
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSelect, onClose]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl shadow-2xl p-6 w-[340px] space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Open File</h3>
          <p className="text-xs text-muted-foreground truncate">{fileName || 'Untitled'}</p>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 h-20 flex-col gap-2"
            onClick={() => onSelect('view')}
          >
            <Eye className="h-5 w-5 text-primary" />
            <div className="text-center">
              <div className="text-sm font-medium">View</div>
              <kbd className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded mt-0.5 inline-block">O</kbd>
            </div>
          </Button>

          <Button
            variant="outline"
            className="flex-1 h-20 flex-col gap-2"
            onClick={() => onSelect('edit')}
          >
            <Pencil className="h-5 w-5 text-primary" />
            <div className="text-center">
              <div className="text-sm font-medium">Edit</div>
              <kbd className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded mt-0.5 inline-block">E</kbd>
            </div>
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground text-center">
          Press <kbd className="bg-muted px-1 py-0.5 rounded">Esc</kbd> to cancel
        </p>
      </div>
    </div>
  );
}
