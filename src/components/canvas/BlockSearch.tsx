import { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Block } from '@/types/canvas';
import { cn } from '@/lib/utils';

interface BlockSearchProps {
  blocks: Block[];
  onNavigateTo: (block: Block) => void;
}

export default function BlockSearch({ blocks, onNavigateTo }: BlockSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? blocks.filter(b => b.label.toLowerCase().includes(query.toLowerCase()))
    : [];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [open]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="h-8 w-8 flex items-center justify-center rounded-lg bg-toolbar border border-toolbar-border hover:bg-accent transition-colors"
        title="Search blocks (Ctrl+K)"
      >
        <Search className="h-4 w-4 text-foreground" />
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(false)}
        className="h-8 w-8 flex items-center justify-center rounded-lg bg-primary text-primary-foreground"
        title="Close search"
      >
        <Search className="h-4 w-4" />
      </button>
      <div className="absolute top-full right-0 mt-2 w-72 bg-popover border border-border rounded-lg shadow-xl overflow-hidden z-50">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search blocks..."
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-60 overflow-y-auto">
          {query.trim() && filtered.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">No blocks found</div>
          )}
          {filtered.map(block => (
            <button
              key={block.id}
              onClick={() => {
                onNavigateTo(block);
                setOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2",
                "text-foreground"
              )}
            >
              <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
              <span className="truncate">{block.label}</span>
              <span className="ml-auto text-xs text-muted-foreground font-mono">
                {Math.round(block.x)}, {Math.round(block.y)}
              </span>
            </button>
          ))}
          {!query.trim() && (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">Type to search blocks</div>
          )}
        </div>
      </div>
    </div>
  );
}
