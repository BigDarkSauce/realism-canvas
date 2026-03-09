import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { hashSHA256 } from '@/lib/crypto';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FilePlus, FolderOpen, Library, HardDrive } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeSelector';

export default function Lobby() {
  const navigate = useNavigate();

  const [createName, setCreateName] = useState('');
  const [createKey, setCreateKey] = useState('');
  const [accessName, setAccessName] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingAccess, setLoadingAccess] = useState(false);

  const handleCreate = async () => {
    if (!createName.trim() || !createKey.trim()) {
      toast.error('Please fill in both fields');
      return;
    }
    setLoadingCreate(true);
    const hashedName = await hashSHA256(createName.trim());
    const hashedKey = await hashSHA256(createKey.trim());

    // Check if name already exists (compare hashed)
    const { data: existing } = await supabase
      .from('canvas_documents')
      .select('id')
      .eq('name', hashedName)
      .maybeSingle();
    if (existing) {
      toast.error('A file with this name already exists');
      setLoadingCreate(false);
      return;
    }
    const { data, error } = await supabase
      .from('canvas_documents')
      .insert([{ name: hashedName, access_key: hashedKey }])
      .select('id')
      .single();
    if (error) {
      toast.error('Failed to create file');
      setLoadingCreate(false);
      return;
    }
    toast.success('File created!');
    navigate(`/canvas/${data.id}`);
  };

  const handleAccess = async () => {
    if (!accessName.trim() || !accessKey.trim()) {
      toast.error('Please fill in both fields');
      return;
    }
    setLoadingAccess(true);
    const hashedName = await hashSHA256(accessName.trim());
    const hashedKey = await hashSHA256(accessKey.trim());

    const { data, error } = await supabase
      .from('canvas_documents')
      .select('id, access_key')
      .eq('name', hashedName)
      .maybeSingle();
    if (error || !data) {
      toast.error('File not found');
      setLoadingAccess(false);
      return;
    }
    if (data.access_key !== hashedKey) {
      toast.error('Incorrect key');
      setLoadingAccess(false);
      return;
    }
    toast.success('Access granted!');
    navigate(`/canvas/${data.id}`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 gap-6 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Create new file */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <FilePlus className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Create New File</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Enter file name</label>
              <Input
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                placeholder="My Canvas"
                maxLength={100}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Create a key</label>
              <Input
                type="password"
                value={createKey}
                onChange={e => setCreateKey(e.target.value)}
                placeholder="Secret key"
                maxLength={100}
              />
            </div>
            <Button onClick={handleCreate} disabled={loadingCreate} className="w-full">
              {loadingCreate ? 'Creating...' : 'Create File'}
            </Button>
          </div>
        </div>

        {/* Access existing file */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Access Existing File</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Provide file name</label>
              <Input
                value={accessName}
                onChange={e => setAccessName(e.target.value)}
                placeholder="File name"
                maxLength={100}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Provide a key</label>
              <Input
                type="password"
                value={accessKey}
                onChange={e => setAccessKey(e.target.value)}
                placeholder="Secret key"
                maxLength={100}
              />
            </div>
            <Button onClick={handleAccess} disabled={loadingAccess} className="w-full">
              {loadingAccess ? 'Accessing...' : 'Open File'}
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          size="lg"
          className="gap-2"
          onClick={() => navigate('/library')}
        >
          <Library className="h-5 w-5" />
          My Library
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="gap-2"
          onClick={() => navigate('/data')}
        >
          <HardDrive className="h-5 w-5" />
          Data & Offline
        </Button>
      </div>
    </div>
  );
}
