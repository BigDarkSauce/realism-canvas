import { useState, useEffect } from 'react';
import { Save, History, Trash2, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Block, Connection, Group, DrawingStroke, CanvasBackground } from '@/types/canvas';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CanvasState {
  blocks: Block[];
  connections: Connection[];
  groups: Group[];
  strokes: DrawingStroke[];
  background: CanvasBackground;
  backgroundImage: string | null;
  canvasSize: { width: number; height: number };
}

interface SaveRecord {
  id: string;
  name: string;
  canvas_data: CanvasState;
  created_at: string;
}

interface SaveLoadPanelProps {
  getCanvasState: () => CanvasState;
  loadCanvasState: (state: CanvasState) => void;
}

export default function SaveLoadPanel({ getCanvasState, loadCanvasState }: SaveLoadPanelProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [saves, setSaves] = useState<SaveRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSaves = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('canvas_saves')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Failed to load history');
    } else {
      setSaves((data as unknown as SaveRecord[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (showHistory) fetchSaves();
  }, [showHistory]);

  const handleSave = async () => {
    const state = getCanvasState();
    const name = `Save ${new Date().toLocaleString()}`;
    const { error } = await supabase
      .from('canvas_saves')
      .insert([{ name, canvas_data: JSON.parse(JSON.stringify(state)) }]);
    if (error) {
      toast.error('Failed to save');
    } else {
      toast.success('Canvas saved!');
      if (showHistory) fetchSaves();
    }
  };

  const handleLoad = (save: SaveRecord) => {
    loadCanvasState(save.canvas_data);
    toast.success(`Loaded: ${save.name}`);
    setShowHistory(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('canvas_saves').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete');
    } else {
      setSaves(prev => prev.filter(s => s.id !== id));
      toast.success('Deleted');
    }
  };

  return (
    <>
      <div className="absolute top-4 right-4 z-50 flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSave}
          className="h-9 gap-2 bg-toolbar border-toolbar-border"
        >
          <Save className="h-4 w-4" />
          Save
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowHistory(!showHistory)}
          className="h-9 gap-2 bg-toolbar border-toolbar-border"
        >
          <History className="h-4 w-4" />
          History
        </Button>
      </div>

      {showHistory && (
        <div className="absolute top-16 right-4 z-50 w-80 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Save History</h3>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowHistory(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="max-h-80">
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground text-center">Loading...</div>
            ) : saves.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">No saves yet</div>
            ) : (
              <div className="divide-y divide-border">
                {saves.map(save => (
                  <div key={save.id} className="px-4 py-3 flex items-center justify-between gap-2 hover:bg-accent/50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{save.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(save.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleLoad(save)}
                        title="Load this save"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(save.id)}
                        title="Delete this save"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </>
  );
}
