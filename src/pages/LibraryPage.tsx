import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { hashSHA256 } from '@/lib/crypto';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  FolderPlus,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Pencil,
  Check,
  X,
} from 'lucide-react';

interface LibraryItem {
  documentId: string;
  displayName: string; // plaintext name for display
}

interface LibraryFolder {
  id: string;
  name: string;
  items: LibraryItem[];
}

interface LibraryData {
  folders: LibraryFolder[];
  unsorted: LibraryItem[];
}

function loadLibrary(): LibraryData {
  try {
    const raw = localStorage.getItem('canvas_library');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { folders: [], unsorted: [] };
}

function saveLibrary(data: LibraryData) {
  localStorage.setItem('canvas_library', JSON.stringify(data));
}

function generateId() {
  return crypto.randomUUID();
}

export default function LibraryPage() {
  const navigate = useNavigate();
  const [library, setLibrary] = useState<LibraryData>(loadLibrary);

  // Add document form
  const [addName, setAddName] = useState('');
  const [addKey, setAddKey] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [targetFolder, setTargetFolder] = useState<string | null>(null);

  // Create document form
  const [createName, setCreateName] = useState('');
  const [createKey, setCreateKey] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createTargetFolder, setCreateTargetFolder] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // New folder
  const [newFolderName, setNewFolderName] = useState('');

  // Expanded folders
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Rename folder
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    saveLibrary(library);
  }, [library]);

  const handleAddDocument = async (folderId: string | null) => {
    if (!addName.trim() || !addKey.trim()) {
      toast.error('Enter both file name and key');
      return;
    }
    setAddLoading(true);
    const hashedName = await hashSHA256(addName.trim());
    const hashedKey = await hashSHA256(addKey.trim());

    const { data, error } = await supabase
      .from('canvas_documents')
      .select('id, access_key')
      .eq('name', hashedName)
      .maybeSingle();

    if (error || !data) {
      toast.error('File not found');
      setAddLoading(false);
      return;
    }
    if (data.access_key !== hashedKey) {
      toast.error('Incorrect key');
      setAddLoading(false);
      return;
    }

    // Check duplicates
    const allItems = [...library.unsorted, ...library.folders.flatMap(f => f.items)];
    if (allItems.some(i => i.documentId === data.id)) {
      toast.error('Already in your library');
      setAddLoading(false);
      return;
    }

    const newItem: LibraryItem = { documentId: data.id, displayName: addName.trim() };

    setLibrary(prev => {
      if (folderId) {
        return {
          ...prev,
          folders: prev.folders.map(f =>
            f.id === folderId ? { ...f, items: [...f.items, newItem] } : f
          ),
        };
      }
      return { ...prev, unsorted: [...prev.unsorted, newItem] };
    });

    toast.success('Added to library!');
    setAddName('');
    setAddKey('');
    setTargetFolder(null);
    setAddLoading(false);
  };

  const removeItem = (documentId: string) => {
    setLibrary(prev => ({
      folders: prev.folders.map(f => ({
        ...f,
        items: f.items.filter(i => i.documentId !== documentId),
      })),
      unsorted: prev.unsorted.filter(i => i.documentId !== documentId),
    }));
    toast.success('Removed from library');
  };

  const createFolder = () => {
    if (!newFolderName.trim()) return;
    setLibrary(prev => ({
      ...prev,
      folders: [...prev.folders, { id: generateId(), name: newFolderName.trim(), items: [] }],
    }));
    setNewFolderName('');
    toast.success('Folder created');
  };

  const deleteFolder = (folderId: string) => {
    setLibrary(prev => {
      const folder = prev.folders.find(f => f.id === folderId);
      return {
        folders: prev.folders.filter(f => f.id !== folderId),
        unsorted: [...prev.unsorted, ...(folder?.items || [])],
      };
    });
    toast.success('Folder deleted, items moved to unsorted');
  };

  const renameFolder = (folderId: string) => {
    if (!renameValue.trim()) return;
    setLibrary(prev => ({
      ...prev,
      folders: prev.folders.map(f =>
        f.id === folderId ? { ...f, name: renameValue.trim() } : f
      ),
    }));
    setRenamingFolder(null);
    setRenameValue('');
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const renderItem = (item: LibraryItem) => (
    <div
      key={item.documentId}
      className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent/50 group"
    >
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <span
        className="flex-1 text-sm text-foreground truncate cursor-pointer hover:underline"
        onClick={() => navigate(`/canvas/${item.documentId}`)}
      >
        {item.displayName}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
        onClick={() => removeItem(item.documentId)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">My Library</h1>
        </div>

        {/* Add document form */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3 shadow-lg">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Document to Library
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              value={addName}
              onChange={e => setAddName(e.target.value)}
              placeholder="File name"
              maxLength={100}
            />
            <Input
              type="password"
              value={addKey}
              onChange={e => setAddKey(e.target.value)}
              placeholder="Access key"
              maxLength={100}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              className="text-sm border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
              value={targetFolder ?? ''}
              onChange={e => setTargetFolder(e.target.value || null)}
            >
              <option value="">Unsorted</option>
              {library.folders.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <Button size="sm" onClick={() => handleAddDocument(targetFolder)} disabled={addLoading}>
              {addLoading ? 'Verifying...' : 'Add'}
            </Button>
          </div>
        </div>

        {/* Create folder */}
        <div className="flex items-center gap-2">
          <FolderPlus className="h-4 w-4 text-muted-foreground" />
          <Input
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            placeholder="New folder name"
            className="max-w-[200px] h-8 text-sm"
            maxLength={50}
            onKeyDown={e => e.key === 'Enter' && createFolder()}
          />
          <Button size="sm" variant="outline" onClick={createFolder}>Create</Button>
        </div>

        {/* Folders */}
        {library.folders.map(folder => (
          <div key={folder.id} className="bg-card border border-border rounded-xl overflow-hidden shadow">
            <div
              className="flex items-center gap-2 p-3 cursor-pointer hover:bg-accent/30"
              onClick={() => toggleExpand(folder.id)}
            >
              {expanded[folder.id] ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <Folder className="h-4 w-4 text-primary" />
              {renamingFolder === folder.id ? (
                <div className="flex items-center gap-1 flex-1" onClick={e => e.stopPropagation()}>
                  <Input
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    className="h-7 text-sm flex-1"
                    maxLength={50}
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && renameFolder(folder.id)}
                  />
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => renameFolder(folder.id)}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setRenamingFolder(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <span className="flex-1 text-sm font-medium text-foreground">{folder.name}</span>
              )}
              <span className="text-xs text-muted-foreground">{folder.items.length}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={e => {
                  e.stopPropagation();
                  setRenamingFolder(folder.id);
                  setRenameValue(folder.name);
                }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={e => {
                  e.stopPropagation();
                  deleteFolder(folder.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            {expanded[folder.id] && (
              <div className="px-3 pb-3 space-y-1 pl-8">
                {folder.items.length === 0 && (
                  <p className="text-xs text-muted-foreground py-1">Empty folder</p>
                )}
                {folder.items.map(renderItem)}
              </div>
            )}
          </div>
        ))}

        {/* Unsorted items */}
        {library.unsorted.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-3 shadow space-y-1">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Unsorted</h3>
            {library.unsorted.map(renderItem)}
          </div>
        )}

        {library.folders.length === 0 && library.unsorted.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            Your library is empty. Add documents above to get started.
          </p>
        )}
      </div>
    </div>
  );
}
