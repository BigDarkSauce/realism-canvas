import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeSelector';
import { toast } from 'sonner';
import { exportAllData, importAllData, downloadJson, ExportBundle } from '@/lib/dataTransfer';
import { ArrowLeft, Download, Upload, Wifi, WifiOff, Server, HardDrive, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function DataManagementPage() {
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const bundle = await exportAllData();
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadJson(bundle, `canvas-backup-${dateStr}.json`);
      toast.success(`Exported ${bundle.documents.length} documents, ${bundle.saves.length} saves, ${bundle.folders.length} folders`);
    } catch (err: any) {
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const bundle: ExportBundle = JSON.parse(text);
      if (!bundle.version || !bundle.documents) {
        throw new Error('Invalid backup file format');
      }
      const result = await importAllData(bundle);
      toast.success(`Imported ${result.documents} documents, ${result.saves} saves, ${result.folders} folders`);
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Data & Offline</h1>
        </div>

        {/* Online Status */}
        <div className={`flex items-center gap-3 p-4 rounded-xl border ${online ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-destructive/10 border-destructive/30'}`}>
          {online ? <Wifi className="h-5 w-5 text-emerald-500" /> : <WifiOff className="h-5 w-5 text-destructive" />}
          <div>
            <p className="font-medium text-foreground">{online ? 'Online' : 'Offline'}</p>
            <p className="text-sm text-muted-foreground">
              {online ? 'Connected to cloud. Data syncing normally.' : 'No internet. Using locally cached data.'}
            </p>
          </div>
        </div>

        {/* Export / Import */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-lg">
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Data Transfer</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Export all your documents, saves, and library configuration as a single JSON file. Save it to a USB drive for backup or transfer to another device.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleExport} disabled={exporting || !online} className="gap-2">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exporting ? 'Exporting...' : 'Export All Data'}
            </Button>
            <Button variant="outline" onClick={handleImportClick} disabled={importing || !online} className="gap-2">
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importing ? 'Importing...' : 'Import Data'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> All documents with their canvas data</p>
            <p className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> All save history and folders</p>
            <p className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Library configuration (folder structure)</p>
            <p className="flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Uploaded files in storage are not included (referenced by URL)</p>
          </div>
        </div>

        {/* Offline Mode */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-lg">
          <div className="flex items-center gap-2">
            <WifiOff className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Offline Mode</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            This app is a Progressive Web App (PWA). Once installed, it caches static assets for offline use. Documents you've opened are also cached locally in your browser.
          </p>
          <div className="text-sm text-muted-foreground space-y-2">
            <p><strong>What works offline:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>App loads from cache (after first install)</li>
              <li>Previously opened documents are available</li>
              <li>Edits are saved locally and synced when back online</li>
              <li>Drawing, block editing, and canvas tools work normally</li>
            </ul>
            <p className="mt-3"><strong>What requires internet:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Creating new documents</li>
              <li>Accessing documents never opened before</li>
              <li>Uploading files to blocks</li>
              <li>Viewing files stored in cloud storage</li>
            </ul>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/install')} className="gap-2">
            <Download className="h-4 w-4" /> Install as App (PWA)
          </Button>
        </div>

        {/* Self-Hosting Guide */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-lg">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Self-Hosting Guide</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            For maximum independence, you can self-host this application on your own infrastructure.
          </p>
          <div className="text-sm text-muted-foreground space-y-3">
            <div>
              <p className="font-medium text-foreground mb-1">Step 1: Get the source code</p>
              <p>Connect your project to GitHub via Settings → Connectors → GitHub, then clone the repository to your machine.</p>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Step 2: Set up your own database</p>
              <p>Create a free Supabase project at <code className="bg-muted px-1 rounded text-xs">supabase.com</code> or self-host Supabase using Docker. Run the migration files from <code className="bg-muted px-1 rounded text-xs">supabase/migrations/</code> to create the required tables.</p>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Step 3: Configure environment</p>
              <p>Create a <code className="bg-muted px-1 rounded text-xs">.env</code> file with your own Supabase URL and anon key:</p>
              <pre className="bg-muted p-2 rounded text-xs mt-1 overflow-x-auto">
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key`}
              </pre>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Step 4: Build and deploy</p>
              <pre className="bg-muted p-2 rounded text-xs mt-1 overflow-x-auto">
{`npm install
npm run build
# Deploy the 'dist' folder to any static host:
# Netlify, Vercel, Cloudflare Pages, or your own server`}
              </pre>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Step 5: Set up storage</p>
              <p>Create a <code className="bg-muted px-1 rounded text-xs">canvas-files</code> storage bucket in your Supabase project with public access enabled.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
