import { useState, useEffect } from 'react';
import { Save, History, Trash2, RotateCcw, X, FolderPlus, Folder, FolderOpen, Pencil, Check, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  folder_id: string | null;
}

interface SaveFolder {
  id: string;
  name: string;
  created_at: string;
}

interface SaveLoadPanelProps {
  documentId: string;
  getCanvasState: () => CanvasState;
  loadCanvasState: (state: CanvasState) => void;
}

export default function SaveLoadPanel({ documentId, getCanvasState, loadCanvasState }: SaveLoadPanelProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [saves, setSaves] = useState<SaveRecord[]>([]);
  const [folders, setFolders] = useState<SaveFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [movingSaveId, setMovingSaveId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const [savesRes, foldersRes] = await Promise.all([
      supabase.from('canvas_saves').select('*').eq('document_id', documentId).order('created_at', { ascending: false }),
      supabase.from('save_folders').select('*').eq('document_id', documentId).order('created_at', { ascending: true }),
    ]);
    if (!savesRes.error) setSaves((savesRes.data as unknown as SaveRecord[]) || []);
    if (!foldersRes.error) setFolders((foldersRes.data as unknown as SaveFolder[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (showHistory) fetchData();
  }, [showHistory]);

  const handleSave = async () => {
    const name = saveName.trim() || `Save ${new Date().toLocaleString()}`;
    const state = getCanvasState();
    const { error } = await supabase
      .from('canvas_saves')
      .insert([{ name, canvas_data: JSON.parse(JSON.stringify(state)), document_id: documentId }]);
    if (error) {
      toast.error('Failed to save');
    } else {
      toast.success('Canvas saved!');
      setSaveName('');
      setShowSaveInput(false);
      if (showHistory) fetchData();
    }
  };

  const handleLoad = (save: SaveRecord) => {
    loadCanvasState(save.canvas_data);
    toast.success(`Loaded: ${save.name}`);
    setShowHistory(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('canvas_saves').delete().eq('id', id);
    if (error) toast.error('Failed to delete');
    else { setSaves(prev => prev.filter(s => s.id !== id)); toast.success('Deleted'); }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim() || 'Untitled Folder';
    const { error } = await supabase.from('save_folders').insert([{ name, document_id: documentId }]);
    if (error) toast.error('Failed to create folder');
    else { toast.success('Folder created'); setNewFolderName(''); setShowNewFolder(false); fetchData(); }
  };

  const handleRenameFolder = async (id: string) => {
    const { error } = await supabase.from('save_folders').update({ name: editingFolderName.trim() }).eq('id', id);
    if (error) toast.error('Failed to rename');
    else { setEditingFolderId(null); fetchData(); }
  };

  const handleDeleteFolder = async (id: string) => {
    // Unassign saves from folder first
    await supabase.from('canvas_saves').update({ folder_id: null }).eq('folder_id', id);
    const { error } = await supabase.from('save_folders').delete().eq('id', id);
    if (error) toast.error('Failed to delete folder');
    else { toast.success('Folder deleted'); fetchData(); }
  };

  const handleMoveSave = async (saveId: string, folderId: string | null) => {
    const { error } = await supabase.from('canvas_saves').update({ folder_id: folderId }).eq('id', saveId);
    if (error) toast.error('Failed to move');
    else { setMovingSaveId(null); fetchData(); }
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const unfolderedSaves = saves.filter(s => !s.folder_id);
  const savesInFolder = (folderId: string) => saves.filter(s => s.folder_id === folderId);

  const renderSave = (save: SaveRecord) => (
    <div key={save.id} className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-accent/50">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{save.name}</p>
        <p className="text-xs text-muted-foreground">{new Date(save.created_at).toLocaleString()}</p>
      </div>
      <div className="flex items-center gap-0.5">
        {movingSaveId === save.id ? (
          <div className="flex flex-col gap-0.5 text-xs">
            <button className="px-2 py-0.5 rounded bg-accent hover:bg-accent/80 text-foreground" onClick={() => handleMoveSave(save.id, null)}>Root</button>
            {folders.map(f => (
              <button key={f.id} className="px-2 py-0.5 rounded bg-accent hover:bg-accent/80 text-foreground" onClick={() => handleMoveSave(save.id, f.id)}>{f.name}</button>
            ))}
            <button className="px-2 py-0.5 text-muted-foreground" onClick={() => setMovingSaveId(null)}>Cancel</button>
          </div>
        ) : (
          <>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setMovingSaveId(save.id)} title="Move to folder">
              <Folder className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleLoad(save)} title="Load">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(save.id)} title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Save button with name input */}
      <div className="relative">
        <Button variant="outline" size="sm" onClick={() => setShowSaveInput(!showSaveInput)} className="h-9 gap-2 bg-toolbar border-toolbar-border">
          <Save className="h-4 w-4" /> Save
        </Button>
        {showSaveInput && (
          <div className="absolute top-full right-0 mt-2 w-64 bg-card border border-border rounded-lg shadow-xl p-3 z-[60]">
            <Input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Save name (optional)" className="mb-2 h-8 text-sm" maxLength={100} />
            <Button size="sm" onClick={handleSave} className="w-full h-8">Save Now</Button>
          </div>
        )}
      </div>

      {/* History panel */}
      <div className="relative">
        <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)} className="h-9 gap-2 bg-toolbar border-toolbar-border">
          <History className="h-4 w-4" /> History
        </Button>

        {showHistory && (
          <div className="absolute top-full right-0 mt-2 w-80 bg-card border border-border rounded-lg shadow-xl overflow-hidden z-[60]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Save History</h3>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowNewFolder(!showNewFolder)} title="New folder">
                  <FolderPlus className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowHistory(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {showNewFolder && (
              <div className="px-4 py-2 border-b border-border flex gap-2">
                <Input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Folder name" className="h-7 text-sm flex-1" maxLength={100} />
                <Button size="sm" className="h-7 px-3" onClick={handleCreateFolder}>Add</Button>
              </div>
            )}

            <ScrollArea className="max-h-80">
              {loading ? (
                <div className="p-4 text-sm text-muted-foreground text-center">Loading...</div>
              ) : saves.length === 0 && folders.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">No saves yet</div>
              ) : (
                <div>
                  {/* Folders */}
                  {folders.map(folder => (
                    <div key={folder.id} className="border-b border-border last:border-b-0">
                      <div className="px-3 py-2 flex items-center gap-2 bg-muted/30 hover:bg-muted/50">
                        <button onClick={() => toggleFolder(folder.id)} className="p-0.5">
                          {expandedFolders.has(folder.id) ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                        </button>
                        {expandedFolders.has(folder.id) ? <FolderOpen className="h-4 w-4 text-primary" /> : <Folder className="h-4 w-4 text-primary" />}
                        {editingFolderId === folder.id ? (
                          <div className="flex-1 flex gap-1">
                            <Input value={editingFolderName} onChange={e => setEditingFolderName(e.target.value)} className="h-6 text-xs flex-1" maxLength={100} />
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleRenameFolder(folder.id)}><Check className="h-3 w-3" /></Button>
                          </div>
                        ) : (
                          <span className="flex-1 text-sm font-medium text-foreground truncate">{folder.name}</span>
                        )}
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setEditingFolderId(folder.id); setEditingFolderName(folder.name); }} title="Rename">
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => handleDeleteFolder(folder.id)} title="Delete folder">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      {expandedFolders.has(folder.id) && (
                        <div className="pl-6">
                          {savesInFolder(folder.id).length === 0 ? (
                            <div className="px-3 py-2 text-xs text-muted-foreground">Empty folder</div>
                          ) : savesInFolder(folder.id).map(renderSave)}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Unfoldered saves */}
                  {unfolderedSaves.length > 0 && (
                    <div className="divide-y divide-border">
                      {unfolderedSaves.map(renderSave)}
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </div>
    </>
  );
}
